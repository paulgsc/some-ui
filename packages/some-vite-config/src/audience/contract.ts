import { dirname, join, resolve } from "path"
import ts from "typescript"

// A2 (AUDIENCES.md): a contract entry carries no implementation. In a
// workspace whose audience is not `public`, the module its package.json
// exports as `./contract`, and every module that one imports relatively,
// import values only from `zod` and from each other; every other import is
// `import type`. The plugin never stubs `/contract`, so whatever it imports
// ships in every profile.
//
// The export points at build output; its source is the workspace's
// `entries.contract` in vite.config.ts, the same entry the build turns into
// that export. Read lexically: a contract this cannot trace fails, rather
// than passing unchecked.
//
// Every relative import joins the graph, `import type` included. A value
// import is any other form that stays in the output, `import { type X }`
// among them (the repo compiles with verbatimModuleSyntax, so it is kept).

const CONTRACT = "./contract"
const SOURCE_EXTENSIONS = [".ts", ".tsx"]

export type ContractSource =
  | { kind: "none" }
  | { kind: "source"; path: string }
  | { kind: "unresolved"; why: string }

/**
 * Where the `./contract` export's source is: nothing when the workspace does
 * not export one, else the file `entries.contract` names in its vite config
 * (`viteConfig`, its text, or null when it has none).
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
  const entries = /\bentries\s*:\s*\{([^}]*)\}/.exec(viteConfig)?.[1]
  const source =
    entries === undefined
      ? undefined
      : /(?:^|[\s,])["']?contract["']?\s*:\s*(["'])([^"']+)\1/.exec(
          entries
        )?.[2]
  return source === undefined
    ? {
        kind: "unresolved",
        why: `it exports ${CONTRACT} but its vite.config.ts has no \`entries: { contract: "<source>" }\` to read`,
      }
    : { kind: "source", path: source }
}

type Edge = { specifier: string; line: number; value: boolean }

function scriptKind(file: string): ts.ScriptKind {
  return file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
}

/**
 * Every module a file names, and whether it stays in the output (`value`).
 * `dynamic` holds the lines of an `import()` whose specifier is not a literal.
 */
function importsOf(
  file: string,
  text: string
): { edges: Array<Edge>; dynamic: Array<number> } {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file)
  )
  const edges: Array<Edge> = []
  const dynamic: Array<number> = []
  const lineOf = (node: ts.Node): number =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
  const add = (node: ts.Node, specifier: string, value: boolean): void => {
    edges.push({ specifier, line: lineOf(node), value })
  }
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      add(
        node,
        node.moduleSpecifier.text,
        node.importClause?.phaseModifier !== ts.SyntaxKind.TypeKeyword
      )
    else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      add(node, node.moduleSpecifier.text, !node.isTypeOnly)
    else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    )
      add(node, node.moduleReference.expression.text, !node.isTypeOnly)
    else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      add(node, node.argument.literal.text, false)
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      const argument = node.arguments[0]
      if (argument !== undefined && ts.isStringLiteralLike(argument))
        add(node, argument.text, true)
      else dynamic.push(lineOf(node))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return { edges, dynamic }
}

function allowedValueSpecifier(specifier: string): boolean {
  return specifier === "zod" || specifier.startsWith("zod/")
}

/** The file a relative specifier names, or null when none of its forms exists. */
function resolveRelative(
  from: string,
  specifier: string,
  read: (path: string) => string | null
): string | null {
  const base = resolve(dirname(from), specifier)
  const stem = base.replace(/\.(?:[cm]?js|jsx)$/, "")
  const candidates = SOURCE_EXTENSIONS.some((ext) => base.endsWith(ext))
    ? [base]
    : [
        ...SOURCE_EXTENSIONS.map((ext) => stem + ext),
        ...SOURCE_EXTENSIONS.map((ext) => join(base, `index${ext}`)),
      ]
  return candidates.find((candidate) => read(candidate) !== null) ?? null
}

/**
 * The messages for a contract graph that breaks A2, starting at `entry`
 * (absolute). `read` gives a file's text, or null when there is no such file.
 */
export function walkContract(
  entry: string,
  read: (path: string) => string | null
): Array<string> {
  const problems: Array<string> = []
  const seen = new Set<string>()
  const queue = [entry]
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (seen.has(file)) continue
    seen.add(file)
    const text = read(file)
    if (text === null) {
      problems.push(
        `${file}: the contract graph reaches this file and it is not there.`
      )
      continue
    }
    const { edges, dynamic } = importsOf(file, text)
    for (const line of dynamic) {
      problems.push(
        `${file}:${line}: an import() or require() whose specifier is not a string literal, so the contract graph cannot be checked.`
      )
    }
    for (const { specifier, line, value } of edges) {
      if (specifier.startsWith(".")) {
        const target = resolveRelative(file, specifier, read)
        if (target === null)
          problems.push(
            `${file}:${line}: "${specifier}" is not a TypeScript module here, so the contract graph cannot be checked.`
          )
        else queue.push(target)
      } else if (value && !allowedValueSpecifier(specifier)) {
        problems.push(
          `${file}:${line}: a value import of "${specifier}". A contract imports values only from zod and from other modules of its own graph; make it \`import type\`, or move the code out of the contract.`
        )
      }
    }
  }
  return problems
}

/**
 * The A2 problems of the workspace at `dir`, and whether it exports a
 * `./contract` at all. `read` gives a file's text, or null when there is no
 * such file.
 */
export function checkContract(
  dir: string,
  read: (path: string) => string | null
): { exported: boolean; problems: Array<string> } {
  const manifestPath = join(dir, "package.json")
  const manifestText = read(manifestPath)
  if (manifestText === null) return { exported: false, problems: [] }
  const parsed: unknown = JSON.parse(manifestText)
  const manifest: Record<string, unknown> =
    typeof parsed === "object" && parsed !== null ? { ...parsed } : {}
  const found = contractSource(manifest, read(join(dir, "vite.config.ts")))
  if (found.kind === "none") return { exported: false, problems: [] }
  if (found.kind === "unresolved")
    return {
      exported: true,
      problems: [`${manifestPath}: ${found.why}, so A2 cannot be checked.`],
    }
  return { exported: true, problems: walkContract(join(dir, found.path), read) }
}
