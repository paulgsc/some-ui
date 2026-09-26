import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs"
import { dirname, join, relative, resolve, sep } from "path"
import ts from "typescript"
import type { Plugin } from "vite"

import type { ViteConfigOptions } from "@/types/index.js"
import { resolveEntryPath } from "@/lib/build-config.js"

/**
 * Where a library's `tsc -p tsconfig.build.json` writes its declarations,
 * relative to the package root.
 */
export const DECLARATION_DIR = "dist/types"

/**
 * Publishes the declarations that `tsc -p tsconfig.build.json` already wrote.
 *
 * INTENT
 *
 * A library build is `tsc -p tsconfig.build.json && vite build`. `tsc` is the
 * type-check gate: it is the only step that fails the build on a type error
 * (vite-plugin-dts, which this replaces, printed the error and exited 0). It
 * also writes the `.d.ts` files, because type-checking and declaration emit
 * build the same TypeScript program, and building it a second time inside
 * vite-plugin-dts was ~90% of every `vite build`. This plugin does the rest
 * of what vite-plugin-dts did. It never type-checks and never emits a
 * declaration itself.
 *
 * WHAT IT DOES, IN ORDER
 *
 * 1. `config` turns off Vite's `emptyOutDir`, and `buildStart` clears `dist/`
 *    itself instead, except for `dist/types`. Vite runs after `tsc`, so a
 *    stock `emptyOutDir` would delete the declarations `tsc` just wrote.
 * 2. `closeBundle` rewrites every tsconfig `paths` alias in the declarations
 *    (`@topik/lib/topik`) into a relative specifier to the emitted
 *    declaration, with a `.js` extension (`../../lib/topik/index.js`), the
 *    ESM form TypeScript maps back to the `.d.ts`. `tsc` leaves aliases as
 *    written, and a consumer does not have the library's `paths`. An alias
 *    left in a `.d.ts` therefore resolves to nothing, and under
 *    `skipLibCheck` that is not an error: the type silently becomes `any`.
 * 3. `closeBundle` writes `dist/<packageName>.d.ts`, the file every
 *    package.json `types` field and `exports["."].types` points at. It
 *    re-exports the entry's declaration, as vite-plugin-dts's
 *    `insertTypesEntry` did, so no package.json has to change.
 *
 * ASSUMPTIONS (each is checked; a violation fails the build and names it)
 *
 * A1. `tsc -p tsconfig.build.json` ran immediately before `vite build`, so
 *     `dist/types` holds this build's declarations. Checked only as far as
 *     "`dist/types` and the entry's declaration exist". A stale `dist/types`
 *     from an earlier run is NOT detected. A bare `vite build` without `tsc`
 *     first can therefore ship stale types. Every build script runs both, and
 *     turbo runs only the script.
 * A2. `tsconfig.build.json` sets `emitDeclarationOnly`, and its
 *     `declarationDir` is `<package>/dist/types`.
 * A3. `tsconfig.build.json` sets `rootDir` explicitly, so a source file's
 *     declaration is at `declarationDir/<file relative to rootDir>.d.ts`. That
 *     only holds when rootDir is fixed rather than inferred from whatever
 *     files the program happened to include.
 * A4. "Uses an alias" means what it means to TypeScript: the specifier
 *     matches a `paths` pattern AND the pattern's target file exists. A match
 *     with no target is a package import that TypeScript resolved from
 *     node_modules instead, and is left alone: chat's "@some-ui/*" -> assets
 *     pattern also matches "@some-ui/shared". (vite-plugin-dts got this
 *     wrong, rewriting "@some-ui/shared" into a missing assets path, so chat's
 *     and slideshow's consumers saw `any`.) A Vite-only alias
 *     (`resolve.alias`) cannot reach a declaration at all, because `tsc`
 *     does not see it and would have failed to resolve it first.
 * A5. An alias's target is a source file `tsc` emitted a declaration for. A
 *     target that is itself a `.d.ts` input, or outside `rootDir`, or
 *     excluded, has no emitted declaration to point at, and fails the build
 *     rather than being rewritten into a path that does not exist.
 * A6. The entry re-exports its public surface with `export *` and, when it
 *     has one, `export { default }`. A default export is detected by text
 *     (`export default`, `as default`) in the entry's declaration.
 * A7. `tsc`'s incremental state lives inside `dist/types`
 *     (`tsBuildInfoFile`). `tsconfig.ui.json` sets `composite`, which makes
 *     `tsc -p` incremental. `tsc -p` trusts its build info and does not check
 *     that the declarations it lists still exist. With the build info kept
 *     elsewhere (by default the package root, whenever `rootDir` is `./src`),
 *     deleting `dist/` or rewriting a declaration left `tsc` emitting nothing
 *     on the next run. Kept together, the two are removed together (a deleted
 *     `dist/`) or kept together (this plugin's own `buildStart`).
 *
 * NON-GOALS
 *
 * Which files are declared is `tsconfig.build.json`'s decision alone: its
 * `include`/`exclude` govern the type-check and the emit, because they are
 * one program. There is no second exclude list here to keep in sync.
 */
export function createDeclarationsPlugin(
  options: ViteConfigOptions,
  packageRoot: string
): Plugin {
  const outDir = resolve(packageRoot, "dist")
  const declarationDir = resolve(packageRoot, DECLARATION_DIR)
  const configFile = resolve(packageRoot, "tsconfig.build.json")

  return {
    name: "some-ui:declarations",
    apply: "build",
    config: () => ({ build: { emptyOutDir: false } }),
    buildStart(): void {
      clearOutDirExceptDeclarations(outDir, declarationDir)
    },
    closeBundle(): void {
      assertDeclarationsEmitted(declarationDir)
      const compilerOptions = readBuildCompilerOptions(configFile)
      const layout: DeclarationLayout = {
        rootDir: assertDeclarationSettings(
          compilerOptions,
          configFile,
          declarationDir
        ),
        declarationDir,
        paths: compilerOptions.paths ?? {},
        pathsBase: pathsBaseOf(compilerOptions, configFile),
      }
      const problems = rewriteAliases(layout)
      if (problems.length > 0) {
        const listed = problems.slice(0, 20).join("\n")
        throw new Error(
          `[some-ui:declarations] ${problems.length} alias(es) in the ` +
            `declarations have no emitted declaration to point at (A5):\n${listed}`
        )
      }
      writeTypesEntry(
        options,
        outDir,
        entryDeclaration(options, packageRoot, layout)
      )
    },
  }
}

/** Where `tsc` put things, and the `paths` it resolved aliases with. */
export type DeclarationLayout = {
  rootDir: string
  declarationDir: string
  paths: ts.MapLike<Array<string>>
  pathsBase: string
}

/** Removes everything in `dist/` except the declarations `tsc` wrote. */
export function clearOutDirExceptDeclarations(
  outDir: string,
  declarationDir: string
): void {
  if (!existsSync(outDir)) return
  for (const name of readdirSync(outDir)) {
    const path = join(outDir, name)
    if (path === declarationDir) continue
    // A declarationDir nested more than one level down keeps its ancestors.
    if (
      declarationDir.startsWith(`${path}${sep}`) &&
      statSync(path).isDirectory()
    ) {
      clearOutDirExceptDeclarations(path, declarationDir)
      continue
    }
    rmSync(path, { recursive: true, force: true })
  }
}

const RUN_TSC_FIRST =
  "Run `tsc -p tsconfig.build.json` before `vite build`: the package's " +
  "build script does both, in that order."

/** A1, the part that can be checked: `tsc` wrote declarations at all. */
export function assertDeclarationsEmitted(declarationDir: string): void {
  if (!existsSync(declarationDir)) {
    throw new Error(
      `[some-ui:declarations] ${declarationDir} does not exist. ${RUN_TSC_FIRST}`
    )
  }
}

function readBuildCompilerOptions(configFile: string): ts.CompilerOptions {
  if (!existsSync(configFile)) {
    throw new Error(
      `[some-ui:declarations] ${configFile} does not exist. Library ` +
        `declarations are emitted by \`tsc -p tsconfig.build.json\`.`
    )
  }
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configFile,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(
          `[some-ui:declarations] ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`
        )
      },
    }
  )
  if (!parsed) {
    throw new Error(`[some-ui:declarations] Could not read ${configFile}.`)
  }
  return parsed.options
}

/** A2, A3 and A7. Returns the explicit rootDir. */
export function assertDeclarationSettings(
  compilerOptions: ts.CompilerOptions,
  configFile: string,
  declarationDir: string
): string {
  const {
    emitDeclarationOnly,
    declarationDir: emitted,
    rootDir,
  } = compilerOptions
  const problems: Array<string> = []
  if (emitDeclarationOnly !== true) {
    problems.push(`"emitDeclarationOnly" must be true`)
  }
  if (emitted === undefined || resolve(emitted) !== declarationDir) {
    problems.push(
      `"declarationDir" must be "./${DECLARATION_DIR}" (is ${emitted ?? "unset"})`
    )
  }
  if (rootDir === undefined) {
    problems.push(`"rootDir" must be set explicitly`)
  }
  const { tsBuildInfoFile } = compilerOptions
  if (
    tsBuildInfoFile !== undefined &&
    !resolve(tsBuildInfoFile).startsWith(declarationDir + sep)
  ) {
    problems.push(
      `"tsBuildInfoFile" must be inside "./${DECLARATION_DIR}" (is ${tsBuildInfoFile})`
    )
  }
  if (
    tsBuildInfoFile === undefined &&
    (compilerOptions.incremental === true || compilerOptions.composite === true)
  ) {
    problems.push(
      `"tsBuildInfoFile" must be set inside "./${DECLARATION_DIR}" for an ` +
        `incremental build`
    )
  }
  if (problems.length > 0 || rootDir === undefined) {
    throw new Error(
      `[some-ui:declarations] ${configFile}: ${problems.join("; ")}. ` +
        `\`tsc -p tsconfig.build.json\` writes this library's declarations, ` +
        `and this plugin publishes them from there.`
    )
  }
  return resolve(rootDir)
}

/**
 * The directory `paths` targets are relative to: `baseUrl` when set, else the
 * tsconfig that declared `paths` (which may be an extended one). The parser
 * records the latter as `pathsBasePath`, an internal field it has set since
 * TypeScript 4.1.
 */
export function pathsBaseOf(
  compilerOptions: ts.CompilerOptions,
  configFile: string
): string {
  // CompilerOptions' index signature reaches the internal field untyped.
  const pathsBasePath = compilerOptions["pathsBasePath"]
  if (compilerOptions.baseUrl !== undefined) return compilerOptions.baseUrl
  return typeof pathsBasePath === "string" ? pathsBasePath : dirname(configFile)
}

/**
 * The files a `paths` alias would send `specifier` to, if any pattern matches
 * it. An exact key ("@some-ui/leetype-wasm") matches only itself; a wildcard
 * key ("@chat/*") matches by prefix and suffix, as TypeScript does.
 */
export function aliasTargets(
  specifier: string,
  paths: ts.MapLike<Array<string>>,
  pathsBase: string
): Array<string> {
  return Object.entries(paths).flatMap(([key, targets]) => {
    const star = key.indexOf("*")
    if (star === -1) {
      return specifier === key
        ? targets.map((target) => resolve(pathsBase, target))
        : []
    }
    const prefix = key.slice(0, star)
    const suffix = key.slice(star + 1)
    if (
      specifier.length < prefix.length + suffix.length ||
      !specifier.startsWith(prefix) ||
      !specifier.endsWith(suffix)
    ) {
      return []
    }
    const matched = specifier.slice(
      prefix.length,
      specifier.length - suffix.length
    )
    return targets.map((target) =>
      resolve(pathsBase, substituteStar(target, matched))
    )
  })
}

/**
 * Puts the matched text where a `paths` target has its `*`. A target holds at
 * most one: TypeScript rejects more (TS5062, "Substitution ... can have at
 * most one '*' character"), so a config that reaches this function has one or
 * none. A target with none maps every match to itself.
 */
export function substituteStar(target: string, matched: string): string {
  const star = target.indexOf("*")
  return star === -1
    ? target
    : `${target.slice(0, star)}${matched}${target.slice(star + 1)}`
}

/** How TypeScript completes an extensionless target, in its order. */
const SOURCE_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".d.ts",
  ".js",
  ".jsx",
  "/index.ts",
  "/index.tsx",
  "/index.d.ts",
  "/index.js",
  "/index.jsx",
]

/**
 * A4: the source file `specifier` resolves to through an alias, or null when
 * it is not an alias use (no pattern matches, or no matched target exists).
 */
export function aliasSource(
  specifier: string,
  paths: ts.MapLike<Array<string>>,
  pathsBase: string
): string | null {
  for (const target of aliasTargets(specifier, paths, pathsBase)) {
    for (const suffix of SOURCE_SUFFIXES) {
      const candidate = target + suffix
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return candidate
      }
    }
  }
  return null
}

/**
 * A5: where `tsc` wrote the declaration for `source`, or null when it wrote
 * none (a `.d.ts` input, a file outside rootDir, an excluded file).
 */
export function emittedDeclaration(
  source: string,
  layout: DeclarationLayout
): string | null {
  if (/\.d\.[mc]?ts$/.test(source)) return null
  const fromRoot = relative(layout.rootDir, source)
  if (fromRoot.startsWith("..")) return null
  const declaration = join(
    layout.declarationDir,
    fromRoot.replace(/\.[mc]?[jt]sx?$/, ".d.ts")
  )
  return existsSync(declaration) ? declaration : null
}

/** A relative ESM specifier from `fromFile` to a `.d.ts` file. */
export function declarationSpecifier(
  fromFile: string,
  declaration: string
): string {
  const path = relative(dirname(fromFile), declaration)
    .split(sep)
    .join("/")
    .replace(/\.d\.ts$/, ".js")
  return path.startsWith(".") ? path : `./${path}`
}

/** `from "x"`, `import("x")`, `import "x"`: the specifiers a `.d.ts` holds. */
const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"']+)\2/g

/**
 * Step 2: rewrites alias specifiers in one declaration file's text. Returns
 * the new text and a problem for each alias it could not point anywhere
 * (A5).
 */
export function rewriteDeclarationText(
  file: string,
  text: string,
  layout: DeclarationLayout
): { text: string; problems: Array<string> } {
  const problems: Array<string> = []
  const rewritten = text.replace(
    SPECIFIER,
    (whole: string, lead: string, quote: string, specifier: string) => {
      const source = aliasSource(specifier, layout.paths, layout.pathsBase)
      if (source === null) return whole
      const declaration = emittedDeclaration(source, layout)
      if (declaration === null) {
        problems.push(
          `${relative(layout.declarationDir, file)}: "${specifier}" -> ${source}`
        )
        return whole
      }
      return `${lead}${quote}${declarationSpecifier(file, declaration)}${quote}`
    }
  )
  return { text: rewritten, problems }
}

function rewriteAliases(layout: DeclarationLayout): Array<string> {
  const problems: Array<string> = []
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) {
        visit(path)
      } else if (name.endsWith(".d.ts")) {
        const original = readFileSync(path, "utf-8")
        const result = rewriteDeclarationText(path, original, layout)
        problems.push(...result.problems)
        if (result.text !== original) writeFileSync(path, result.text)
      }
    }
  }
  visit(layout.declarationDir)
  return problems
}

/** A1 and A3: the entry's declaration, which must exist. */
export function entryDeclaration(
  options: ViteConfigOptions,
  packageRoot: string,
  layout: DeclarationLayout
): string {
  const entry = resolveEntryPath(options, packageRoot)
  const path = join(
    layout.declarationDir,
    relative(layout.rootDir, entry).replace(/\.[mc]?tsx?$/, ".d.ts")
  )
  if (!existsSync(path)) {
    throw new Error(
      `[some-ui:declarations] ${path} does not exist. ${RUN_TSC_FIRST}`
    )
  }
  return path
}

/** The text of `dist/<packageName>.d.ts`, re-exporting the entry (A6). */
export function typesEntrySource(
  from: string,
  entryDeclarationSource: string
): string {
  const hasDefault = /\bexport\s+default\b|\bas\s+default\b/.test(
    entryDeclarationSource
  )
  return [
    `export * from "${from}"`,
    ...(hasDefault ? [`export { default } from "${from}"`] : []),
    "export {}",
    "",
  ].join("\n")
}

function writeTypesEntry(
  options: ViteConfigOptions,
  outDir: string,
  declaration: string
): void {
  // `packageName` may be scoped ("@some-ui/topik"), which nests the entry.
  const typesEntry = join(outDir, `${options.packageName}.d.ts`)
  mkdirSync(dirname(typesEntry), { recursive: true })
  writeFileSync(
    typesEntry,
    typesEntrySource(
      declarationSpecifier(typesEntry, declaration),
      readFileSync(declaration, "utf-8")
    )
  )
}
