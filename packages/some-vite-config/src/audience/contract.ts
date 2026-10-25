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

/**
 * What a vite config says that A2 reads: the `contract` entry of every
 * `entries: { … }` object, and every `packageName`. A value that is not a
 * string literal is null.
 */
function readConfig(viteConfig: string): {
  contracts: Array<string | null>
  packageNames: Array<string | null>
} {
  const source = ts.createSourceFile(
    "vite.config.ts",
    viteConfig,
    ts.ScriptTarget.Latest,
    true
  )
  const contracts: Array<string | null> = []
  const packageNames: Array<string | null> = []
  const nameOf = (name: ts.PropertyName): string | undefined =>
    ts.isIdentifier(name) || ts.isStringLiteralLike(name)
      ? name.text
      : undefined
  const literal = (value: ts.Expression): string | null =>
    ts.isStringLiteralLike(value) ? value.text : null
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node)) {
      const name = nameOf(node.name)
      if (name === "packageName") packageNames.push(literal(node.initializer))
      if (
        name === "entries" &&
        ts.isObjectLiteralExpression(node.initializer)
      ) {
        for (const entry of node.initializer.properties) {
          if (
            ts.isPropertyAssignment(entry) &&
            nameOf(entry.name) === "contract"
          )
            contracts.push(literal(entry.initializer))
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return { contracts, packageNames }
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
  const { contracts, packageNames } = readConfig(viteConfig)
  const [only, ...otherContracts] = contracts
  if (only === undefined || only === null || otherContracts.length > 0)
    return {
      kind: "unresolved",
      why: `it exports ${CONTRACT} but its vite.config.ts has not exactly one \`entries: { contract: "<source>" }\` with a string to read`,
    }
  const [packageName, ...otherNames] = packageNames
  if (
    packageName === undefined ||
    packageName === null ||
    otherNames.length > 0
  )
    return {
      kind: "unresolved",
      why: `it exports ${CONTRACT} but its vite.config.ts has not exactly one \`packageName\` string to read`,
    }
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
  return { kind: "source", path: only }
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
