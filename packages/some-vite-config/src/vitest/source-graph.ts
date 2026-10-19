import { existsSync, readFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import ts from "typescript"

/** How a package's own imports name its source. */
export type SourceGraph = {
  /** The package's `src` directory, absolute. */
  readonly src: string
  /**
   * Specifiers that name the package's own code. A key ending in `/` is a
   * prefix mapped to a directory under `src` (`"@speech/": ""`); any other
   * key is an exact specifier mapped to a file (`"@some-ui/speech":
   * "index.ts"`).
   */
  readonly aliases: Readonly<Record<string, string>>
  /**
   * Follow type-only imports too. Off, the walk is what a bundle reaches;
   * on, it is every module whose vocabulary the entry can name.
   */
  readonly types?: boolean
}

export type Reached = {
  /** Every file of the package reached, relative to `src`. */
  readonly files: ReadonlySet<string>
  /** Every other package named by a followed import. */
  readonly packages: ReadonlySet<string>
}

const CANDIDATES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]

/** A source file for an import of the package's own code, or null. */
function resolveImport(
  graph: SourceGraph,
  from: string,
  specifier: string
): string | null {
  let base: string | null = specifier.startsWith(".")
    ? join(dirname(from), specifier)
    : null
  for (const [alias, target] of Object.entries(graph.aliases)) {
    if (
      alias.endsWith("/") ? specifier.startsWith(alias) : specifier === alias
    ) {
      base = join(
        graph.src,
        target,
        alias.endsWith("/") ? specifier.slice(alias.length) : ""
      )
      break
    }
  }
  if (base === null) return null
  for (const suffix of CANDIDATES) {
    const path = `${base}${suffix}`
    if (/\.tsx?$/.test(path) && existsSync(path)) return path
  }
  throw new Error(`cannot resolve "${specifier}" from ${from}`)
}

/** Whether an import or export declaration survives type erasure. */
function isRuntime(node: ts.ImportDeclaration | ts.ExportDeclaration): boolean {
  if (ts.isExportDeclaration(node)) {
    if (node.isTypeOnly) return false
    const clause = node.exportClause
    if (clause && ts.isNamedExports(clause) && clause.elements.length > 0) {
      return clause.elements.some((element) => !element.isTypeOnly)
    }
    return true
  }
  const clause = node.importClause
  if (!clause) return true // a side-effect import
  if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return false
  if (clause.name) return true
  const bindings = clause.namedBindings
  if (!bindings || ts.isNamespaceImport(bindings)) return true
  return (
    bindings.elements.length === 0 ||
    bindings.elements.some((element) => !element.isTypeOnly)
  )
}

/**
 * Every file of the package `entry` (relative to `src`) reaches, and every
 * other package it names. An import of the package's own code that resolves
 * to no file throws, so a walk never ends early without saying so.
 */
export function reachedFrom(graph: SourceGraph, entry: string): Reached {
  const seen = new Set<string>()
  const packages = new Set<string>()
  const visit = (file: string): void => {
    if (seen.has(file)) return
    seen.add(file)
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf-8"),
      ts.ScriptTarget.Latest
    )
    const follow = (specifier: ts.Expression | undefined): void => {
      if (!specifier || !ts.isStringLiteralLike(specifier)) return
      const target = resolveImport(graph, file, specifier.text)
      if (target) visit(target)
      else packages.add(specifier.text)
    }
    // Every node, not only top-level statements: a lazy `import()` anywhere
    // reaches its module as surely as a static import does.
    const walk = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (graph.types === true || isRuntime(node)) {
          follow(node.moduleSpecifier)
        }
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        (graph.types === true || !node.isTypeOnly) &&
        ts.isExternalModuleReference(node.moduleReference)
      ) {
        follow(node.moduleReference.expression)
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        follow(node.arguments[0])
      }
      ts.forEachChild(node, walk)
    }
    walk(source)
  }
  visit(join(graph.src, entry))
  return {
    files: new Set([...seen].map((file) => relative(graph.src, file))),
    packages,
  }
}
