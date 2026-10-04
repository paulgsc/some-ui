/**
 * What each package entry reaches at runtime, from its source.
 *
 * The entries split the backends so an app's build carries only the ones it
 * passes to the session. That holds only while no entry imports another's
 * backend: a module reached from two entries is moved into a chunk they
 * share, and from there into every build that imports either, so one stray
 * import (a constant re-exported from an adapter, say) puts that whole
 * adapter back in every build, and no build fails. Type-only imports are
 * erased and do not count.
 */

import { existsSync, readFileSync } from "fs"
import { dirname, join, relative } from "path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

const SRC = dirname(new URL(import.meta.url).pathname)

const CANDIDATES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]

const PACKAGE = "@some-ui/speech"

/** A source file for an import of this package's own code, or null. */
function resolveImport(from: string, specifier: string): string | null {
  // The package naming itself goes to the entry's source, as the build would.
  if (specifier === PACKAGE) return join(SRC, "index.ts")
  const base = specifier.startsWith(`${PACKAGE}/`)
    ? join(SRC, specifier.slice(PACKAGE.length + 1))
    : specifier.startsWith("@speech/")
      ? join(SRC, specifier.slice("@speech/".length))
      : specifier.startsWith(".")
        ? join(dirname(from), specifier)
        : null
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
  if (clause.isTypeOnly) return false
  if (clause.name) return true
  const bindings = clause.namedBindings
  if (!bindings || ts.isNamespaceImport(bindings)) return true
  return (
    bindings.elements.length === 0 ||
    bindings.elements.some((element) => !element.isTypeOnly)
  )
}

/** Every source file `entry` reaches through runtime imports, relative to src. */
function reachedFrom(entry: string): Set<string> {
  const seen = new Set<string>()
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
      const target = resolveImport(file, specifier.text)
      if (target) visit(target)
    }
    // Every node, not only top-level statements: a lazy `import()` anywhere
    // reaches its module as surely as a static import does.
    const walk = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (isRuntime(node)) follow(node.moduleSpecifier)
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        !node.isTypeOnly &&
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
  visit(join(SRC, entry))
  return new Set([...seen].map((file) => relative(SRC, file)))
}

/** What belongs to one backend, and to no other entry. */
const BACKEND_MODULES = {
  http: ["lib/adapters/http/", "lib/engine/"],
  "web-speech": ["lib/adapters/web-speech/"],
  native: ["lib/adapters/native/"],
} as const

type Backend = keyof typeof BACKEND_MODULES

function isBackend(name: string): name is Backend {
  return name in BACKEND_MODULES
}

const BACKENDS: ReadonlyArray<Backend> =
  Object.keys(BACKEND_MODULES).filter(isBackend)

function backendOf(module: string): Backend | null {
  return (
    BACKENDS.find((backend) =>
      BACKEND_MODULES[backend].some((prefix) => module.startsWith(prefix))
    ) ?? null
  )
}

describe("package entries", () => {
  it("the main entry reaches no backend", () => {
    const leaks = [...reachedFrom("index.ts")].filter(
      (module) => backendOf(module) !== null
    )
    expect(leaks).toEqual([])
  })

  it.each(BACKENDS)(
    "the %s entry reaches its own backend and no other",
    (backend) => {
      const reached = [...reachedFrom(`${backend}.ts`)]
      const owners = new Set(reached.map(backendOf))

      // Its own adapter, so this cannot pass by reaching nothing at all.
      expect(reached).toContain(`${BACKEND_MODULES[backend][0]}index.ts`)
      expect([...owners].filter((owner) => owner !== null)).toEqual([backend])
    }
  )

  it("classifies everything a backend reaches that the main entry does not", () => {
    // Otherwise a module only one backend uses, outside the prefixes above,
    // is invisible to the tests before it: the main entry could start
    // importing it, moving it into a shared chunk, and nothing would fail.
    const main = reachedFrom("index.ts")
    const unclassified = BACKENDS.flatMap((backend) =>
      [...reachedFrom(`${backend}.ts`)].filter(
        (module) =>
          module !== `${backend}.ts` &&
          !main.has(module) &&
          backendOf(module) === null
      )
    )
    expect(unclassified).toEqual([])
  })
})
