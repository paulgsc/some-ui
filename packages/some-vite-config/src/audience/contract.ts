import { existsSync, readFileSync } from "fs"
import { join } from "path"
import ts from "typescript"

// A relative import on purpose: scripts/check-ui-manifests.ts runs this from
// source under tsx, which resolves no `@/` alias.
// eslint-disable-next-line no-restricted-imports
import { reachedFrom } from "../vitest/source-graph.js"

// A2 (AUDIENCES.md): a contract entry carries no implementation.
//
// The `./contract` export points at build output; its source is the
// workspace's `entries.contract` in vite.config.ts, the entry the build turns
// into that export. The walk is `reachedFrom`'s with type imports followed
// too, so every module the contract imports relatively is in the graph, and
// what it may name is what a runtime import reaches: `zod` and nothing else.
// A contract the check cannot trace fails rather than passing unchecked.

const CONTRACT = "./contract"

export type ContractSource =
  | { kind: "none" }
  | { kind: "source"; path: string }
  | { kind: "unresolved"; why: string }

type ConfigRead =
  | { ok: true; packageName: string; contract: string }
  | { ok: false; why: string }

const SHAPE =
  "its vite.config.ts is not `export default createViteConfig({ … })` over a literal object"

/**
 * What a vite config says that A2 reads: its `packageName` and
 * `entries.contract`. Only one shape is read: `export default
 * createViteConfig({ … })` over an object literal with no spread, computed
 * key, method or `configOverrides`, whose `entries` is a literal object of the
 * same kind. Anything else could change which file the build uses without the
 * text saying so, so it is not read.
 */
function readConfig(viteConfig: string): ConfigRead {
  const source = ts.createSourceFile(
    "vite.config.ts",
    viteConfig,
    ts.ScriptTarget.Latest,
    true
  )
  const nameOf = (name: ts.PropertyName): string | undefined =>
    ts.isIdentifier(name) || ts.isStringLiteralLike(name)
      ? name.text
      : undefined
  /** The plain properties of an object literal, or why it has other kinds. */
  const plain = (
    object: ts.ObjectLiteralExpression
  ): Map<string, ts.Expression> | null => {
    const found = new Map<string, ts.Expression>()
    for (const property of object.properties) {
      let name: string | undefined
      let value: ts.Expression | undefined
      if (ts.isPropertyAssignment(property)) {
        name = nameOf(property.name)
        value = property.initializer
      } else if (ts.isShorthandPropertyAssignment(property)) {
        name = property.name.text
        value = property.name
      }
      if (name === undefined || value === undefined || found.has(name))
        return null
      found.set(name, value)
    }
    return found
  }

  const exported = source.statements.filter(ts.isExportAssignment)
  const call = exported.length === 1 ? exported[0]?.expression : undefined
  const options =
    call && ts.isCallExpression(call) ? call.arguments[0] : undefined
  if (
    !call ||
    !ts.isCallExpression(call) ||
    !ts.isIdentifier(call.expression) ||
    call.expression.text !== "createViteConfig" ||
    call.arguments.length !== 1 ||
    options === undefined ||
    !ts.isObjectLiteralExpression(options)
  )
    return { ok: false, why: SHAPE }
  const top = plain(options)
  if (top === null || top.has("configOverrides"))
    return {
      ok: false,
      why: "its createViteConfig options have a spread, a computed key, a method, a repeated key or `configOverrides`, any of which can change what the build uses",
    }
  const packageName = top.get("packageName")
  if (packageName === undefined || !ts.isStringLiteralLike(packageName))
    return {
      ok: false,
      why: "its vite.config.ts has no `packageName` string to read",
    }
  const entries = top.get("entries")
  const inner =
    entries !== undefined && ts.isObjectLiteralExpression(entries)
      ? plain(entries)
      : null
  const contract = inner?.get("contract")
  if (contract === undefined || !ts.isStringLiteralLike(contract))
    return {
      ok: false,
      why: 'its vite.config.ts has no `entries: { contract: "<source>" }` of plain properties to read',
    }
  return { ok: true, packageName: packageName.text, contract: contract.text }
}

/** Every string under an export's conditions. */
function targetsOf(target: unknown): Array<string> {
  if (typeof target === "string") return [target]
  if (typeof target !== "object" || target === null) return []
  return Object.values(target).flatMap(targetsOf)
}

/**
 * Where the `./contract` export's source is: nothing when the workspace does
 * not export one, else the file `entries.contract` names in its vite config
 * (`viteConfig`, its text, or null when it has none). The export must be that
 * entry's build output, `./dist/<packageName>/contract.*`: otherwise the file
 * checked is not the one consumers get.
 */
export function contractSource(
  manifest: Record<string, unknown>,
  viteConfig: string | null
): ContractSource {
  const exports = manifest["exports"]
  if (typeof exports !== "object" || exports === null || !(CONTRACT in exports))
    return { kind: "none" }
  if (viteConfig === null)
    return {
      kind: "unresolved",
      why: `it exports ${CONTRACT} but has no vite.config.ts naming its source`,
    }
  const config = readConfig(viteConfig)
  if (!config.ok)
    return {
      kind: "unresolved",
      why: `it exports ${CONTRACT} but ${config.why}`,
    }
  const { packageName } = config
  const output = `./dist/${packageName}/contract.`
  const targets = targetsOf(
    Object.entries(exports).find(([key]) => key === CONTRACT)?.[1]
  )
  if (
    targets.length === 0 ||
    targets.some((target) => !target.startsWith(output))
  )
    return {
      kind: "unresolved",
      why: `its ${CONTRACT} export is not the build output of its \`entries.contract\` (${output}*)`,
    }
  return { kind: "source", path: config.contract }
}

/**
 * The A2 problems of the workspace at `dir` (absolute), and whether it
 * exports a `./contract` at all.
 */
export function checkContract(dir: string): {
  exported: boolean
  problems: Array<string>
} {
  const manifestPath = join(dir, "package.json")
  const viteConfigPath = join(dir, "vite.config.ts")
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"))
  const manifest: Record<string, unknown> =
    typeof parsed === "object" && parsed !== null ? { ...parsed } : {}
  const found = contractSource(
    manifest,
    existsSync(viteConfigPath) ? readFileSync(viteConfigPath, "utf8") : null
  )
  if (found.kind === "none") return { exported: false, problems: [] }
  if (found.kind === "unresolved")
    return {
      exported: true,
      problems: [`${manifestPath}: ${found.why}, so A2 cannot be checked.`],
    }
  try {
    const reached = reachedFrom(
      { src: dir, aliases: {}, types: true },
      found.path
    )
    const problems: Array<string> = []
    for (const [name, places] of reached.values) {
      if (name === "zod") continue
      for (const place of places)
        problems.push(
          `${join(dir, place)}: a value import of "${name}". A contract imports values only from zod and from other modules of its own graph; make it \`import type\`, or move the code out of the contract.`
        )
    }
    for (const place of reached.unreadable)
      problems.push(
        `${join(dir, place)}: an import the contract graph cannot follow (an import() with no literal specifier, or an import.meta.glob).`
      )
    return { exported: true, problems }
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    return {
      exported: true,
      problems: [
        `${manifestPath}: the contract graph cannot be checked: ${why}.`,
      ],
    }
  }
}
