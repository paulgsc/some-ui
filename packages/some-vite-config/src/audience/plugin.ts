import { readFileSync } from "fs"
import { extname, relative, resolve, sep } from "path"
import type { Plugin, ResolvedConfig } from "vite"
import { parseSync } from "vite"

import type { AudienceWorkspace } from "./manifests.js"
import { readAudienceWorkspaces } from "./manifests.js"
import type { Audience, BuildProfile } from "./schema.js"
import { CONTRACT_SUBPATH } from "./schema.js"

/** Import this to ask which audiences the running build carries. */
export const BUILD_PROFILE_MODULE = "virtual:build-profile"
const RESOLVED_BUILD_PROFILE = `\0${BUILD_PROFILE_MODULE}`
const STUB_PREFIX = "\0audience-stub:"

/** Every audience but `public` is gated: see `AudiencePluginOptions.gates`. */
export type GatedAudience = Exclude<Audience, "public">

export type AudiencePluginOptions<P extends Record<string, BuildProfile>> = {
  /** The app's profiles, from `defineProfiles`. */
  profiles: P
  /** The requested profile name, usually `process.env.SOME_UI_PROFILE`. */
  profile: string | undefined
  /** Used when `profile` is unset or empty. */
  defaultProfile: keyof P & string
  /**
   * Absolute directories whose immediate children are workspaces carrying a
   * `package.json#someUi` field (for www: `packages/ui`).
   */
  workspaceRoots: ReadonlyArray<string>
  /**
   * Where the app may import each gated audience's workspaces from, as
   * directories relative to the vite root. Typed as a total record so adding
   * an audience to `AUDIENCES` fails `tsc` here until it is given a gate.
   *
   * Enforced in every profile, not only the ones that stub the audience out:
   * an import outside its gate would otherwise build fine locally and only
   * fail in whichever deploy happens to exclude it.
   */
  gates: Readonly<Record<GatedAudience, ReadonlyArray<string>>>
}

function isInside(file: string, dir: string): boolean {
  return file === dir || file.startsWith(dir + sep)
}

/** A module id as a plain path: no `\0` prefix, no `?query`. */
function idPath(id: string): string {
  return id.replace(/^\0/, "").split("?")[0] ?? id
}

const SCRIPT_EXTENSION = /^\.[cm]?[jt]sx?$/

type Resolver = (source: string, importer: string) => Promise<string | null>

/**
 * The names a module exports, following `export *` through `resolve`. The
 * stub has to export exactly these: importing a name a module lacks is a
 * bundler error, and the stub must link wherever the real module would.
 */
async function collectExports(
  file: string,
  resolveImport: Resolver,
  seen: Set<string> = new Set()
): Promise<Set<string>> {
  const names = new Set<string>()
  if (seen.has(file)) return names
  seen.add(file)

  const { program, errors } = parseSync(file, readFileSync(file, "utf8"))
  if (errors.length > 0) {
    const reasons = errors.map((e) => e.message).join("; ")
    throw new Error(
      `[build-audience] cannot read the exports of ${file} to stub it: ${reasons}`
    )
  }
  for (const node of program.body) {
    if (node.type === "ExportDefaultDeclaration") {
      names.add("default")
    } else if (node.type === "ExportNamedDeclaration") {
      if (node.exportKind === "type") continue
      const declaration = node.declaration
      if (declaration && "id" in declaration && declaration.id) {
        if (declaration.id.type === "Identifier") {
          names.add(declaration.id.name)
        }
      }
      if (declaration?.type === "VariableDeclaration") {
        for (const d of declaration.declarations) {
          if (d.id.type === "Identifier") names.add(d.id.name)
        }
      }
      for (const specifier of node.specifiers) {
        if (specifier.exportKind === "type") continue
        const exported = specifier.exported
        names.add(
          exported.type === "Identifier" ? exported.name : exported.value
        )
      }
    } else if (node.type === "ExportAllDeclaration") {
      if (node.exportKind === "type") continue
      if (node.exported) {
        const exported = node.exported
        names.add(
          exported.type === "Identifier" ? exported.name : exported.value
        )
        continue
      }
      const target = await resolveImport(node.source.value, file)
      if (!target) continue
      for (const name of await collectExports(target, resolveImport, seen)) {
        // `export *` never re-exports a default.
        if (name !== "default") names.add(name)
      }
    }
  }
  return names
}

function stubModule(
  source: string,
  profile: string,
  audience: Audience,
  names: Set<string>
): string {
  const message = JSON.stringify(
    `${source} is a "${audience}"-audience workspace, stubbed out of the ` +
      `"${profile}" build profile. Nothing should reach this at runtime: ` +
      `the route that imports it is gated by requireAudience("${audience}").`
  )
  const lines = [
    `const excluded = () => { throw new Error(${message}) }`,
    ...[...names].map((name) =>
      name === "default"
        ? "export default excluded"
        : `export { excluded as ${JSON.stringify(name)} }`
    ),
  ]
  return lines.join("\n")
}

/**
 * Builds one app into several deployables by audience, without a second app.
 *
 * Each `packages/ui/*` workspace declares an audience in its manifest; each
 * build selects a profile, which lists the audiences it carries. A workspace
 * outside the profile is replaced by a stub that exports the same names - so
 * it links, typechecks and routes exactly as in a full build - while none of
 * its code, dependencies or authored CSS reach the bundle.
 *
 * Types never see the stub. `tsc` resolves the real package in every profile;
 * only vite's resolver is redirected. The route tree, typed links, search
 * schemas and loaders are therefore identical across profiles, and a stubbed
 * route renders not-found by way of its gate instead of vanishing from the
 * router's types.
 */
export function audiencePlugin<P extends Record<string, BuildProfile>>(
  options: AudiencePluginOptions<P>
): Plugin {
  const profileName = options.profile || options.defaultProfile
  const profile: BuildProfile | undefined = options.profiles[profileName]
  if (!profile) {
    throw new Error(
      `[build-audience] unknown build profile "${profileName}". ` +
        `Known profiles: ${Object.keys(options.profiles).join(", ")}.`
    )
  }
  const audiences = profile.audiences
  const { workspaces, problems } = readAudienceWorkspaces(
    options.workspaceRoots
  )
  if (problems.length > 0) {
    throw new Error(`[build-audience] ${problems.join("\n\n")}`)
  }
  const gated = workspaces.filter((w) => w.audience !== "public")
  const excluded = workspaces.filter((w) => !audiences.includes(w.audience))
  const stubs = new Map<
    string,
    { source: string; real: string; w: AudienceWorkspace }
  >()
  let root = process.cwd()

  function gatesOf(audience: Audience): ReadonlyArray<string> {
    return audience === "public" ? [] : options.gates[audience]
  }

  function mayImport(importer: string, target: AudienceWorkspace): boolean {
    const file = idPath(importer)
    // A workspace of the same audience may use another freely.
    if (
      gated.some((w) => w.audience === target.audience && isInside(file, w.dir))
    ) {
      return true
    }
    return gatesOf(target.audience).some((gate) =>
      isInside(file, resolve(root, gate))
    )
  }

  return {
    name: "some-ui:build-audience",
    enforce: "pre",

    configResolved(config: ResolvedConfig): void {
      root = config.root
    },

    async resolveId(source, importer, resolveOptions): Promise<string | null> {
      if (source === BUILD_PROFILE_MODULE) return RESOLVED_BUILD_PROFILE

      const target = gated.find(
        (w) => source === w.name || source.startsWith(`${w.name}/`)
      )
      if (!target) return null
      if (source.slice(target.name.length) === CONTRACT_SUBPATH) return null

      if (importer && !mayImport(importer, target)) {
        this.error(
          `[build-audience] ${relative(root, idPath(importer))} imports ` +
            `${source}, a "${target.audience}"-audience workspace, from ` +
            `outside ${gatesOf(target.audience).join(", ")}. Import it under that directory, or ` +
            `import only its "${target.name}${CONTRACT_SUBPATH}" subpath.`
        )
      }

      if (audiences.includes(target.audience)) return null

      const resolved = await this.resolve(source, importer, {
        ...resolveOptions,
        skipSelf: true,
      })
      if (!resolved) return null
      const id = `${STUB_PREFIX}${source}`
      stubs.set(id, { source, real: idPath(resolved.id), w: target })
      return id
    },

    async load(id): Promise<string | null> {
      if (id === RESOLVED_BUILD_PROFILE) {
        return [
          `export const profile = ${JSON.stringify(profileName)}`,
          `export const audiences = Object.freeze(${JSON.stringify(audiences)})`,
          "export const hasAudience = (audience) => audiences.includes(audience)",
        ].join("\n")
      }

      const stub = stubs.get(id)
      if (stub) {
        // Stylesheets and other assets: nothing to mirror.
        if (!SCRIPT_EXTENSION.test(extname(stub.real))) return "export {}"
        const names = await collectExports(stub.real, async (s, from) => {
          const r = await this.resolve(s, from, { skipSelf: true })
          return r ? idPath(r.id) : null
        })
        return stubModule(stub.source, profileName, stub.w.audience, names)
      }

      // A stylesheet reached by path rather than by package name: main.tsx's
      // eager `import.meta.glob` over every workspace's authored CSS. Empty
      // it. Scripts are left alone - the one legitimate way a script of an
      // excluded workspace gets here is its `./contract` entry, and a
      // package-name import of anything else was already gated and stubbed
      // in resolveId.
      const file = idPath(id)
      if (extname(file) !== ".css") return null
      if (file.includes(`${sep}node_modules${sep}`)) return null
      return excluded.some((w) => isInside(file, w.dir)) ? "" : null
    },
  }
}
