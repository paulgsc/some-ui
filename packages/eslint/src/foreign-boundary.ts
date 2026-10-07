// F1 (docs/monorepo-boundaries.md, "A port translates: the foreign
// boundary"): every wait on an API this codebase does not own goes through
// `callForeign` (`@some-ui/intent-kit`), or is listed in
// `scripts/foreign-boundary.allowlist` at its file's exact count. A count,
// like R1, for the reason the doc gives.
//
// What is foreign: whatever is imported from a native plugin
// (`@capacitor/*`, `@capacitor-community/*`), statically or by `import()`,
// and the browser's `navigator` and `Notification`. A variable initialized
// from a foreign value is foreign too (`const db = await sqlite.open()`,
// `const listening = Plugin.start()`), followed within the file. `fetch` is
// not: `file_host` has its own boundary (`apps/www/src/lib/intent/errors.ts`
// and the client's deadline), and the intent lint covers handlers.
//
// What is a site: an `await`, a `for await`, or a `.then`/`.catch`/
// `.finally` call, on a value that comes from a foreign API: a foreign name,
// a member of one, or what calling or constructing one returns
// (`await navigator.clipboard.writeText(t)`, `await listening`,
// `Plugin.stop().catch(...)`), through `Promise.all([...])`, `?:`, `??`,
// `||` and `&&`. Only where the value comes from counts: `await
// post(subscription)` waits on `post`, ours, even when it is handed a
// foreign value. Awaiting `import("@capacitor/…")` itself loads
// our own bundle, so it is not a site, though what it yields is foreign.
// Anything inside the arguments of a `callForeign(...)` call imported from
// `@some-ui/intent-kit` (under any local name) is bounded, so not a site.
//
// Known blind spots, each the reviewer's rather than this count's:
// - a callback API wrapped in a hand-made `new Promise` (Web Speech,
//   IndexedDB, `MediaRecorder` events): no foreign promise is awaited;
// - a fire-and-forget call (`void Plugin.speak()`), as in R1;
// - a foreign value reached only through a function of ours (`const f =
//   () => navigator.x(); await f()`, counted inside `f` only if `f` itself
//   waits), or an assignment rather than a declaration;
// - a local variable that shadows a foreign name is still counted (an
//   over-count shows up in the diff, which is the safe direction).
//
// Exact match, both ways, as in R1: a count that falls must be lowered in
// the same change, so the pin always says what is there.
import ts from "typescript"

import type { CountedCheck, CountViolation } from "./site-count.ts"
import {
  describeCountViolation,
  findCountViolations,
  isInScope,
  parseSource,
  PROMISE_CHAIN,
} from "./site-count.ts"

export { isInScope }

export const ALLOWLIST_FILE = "scripts/foreign-boundary.allowlist"

const FOREIGN_MODULE = /^@capacitor(?:-community)?\//
const FOREIGN_GLOBALS: ReadonlySet<string> = new Set([
  "navigator",
  "Notification",
])
const BOUNDARY_MODULE = "@some-ui/intent-kit"
const BOUNDARY_EXPORT = "callForeign"
const REASON = /^#\s*(?:Unbounded|Grandfathered):\s*\S/

function isForeignImport(node: ts.Node): boolean {
  return (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments.length > 0 &&
    ts.isStringLiteralLike(node.arguments[0]!) &&
    FOREIGN_MODULE.test(node.arguments[0].text)
  )
}

function unwrap(node: ts.Expression): ts.Expression {
  let current = node
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  )
    current = current.expression
  return current
}

const COMBINATORS = new Set(["all", "allSettled", "any", "race"])

/** `Promise.all(...)` and its siblings: waits on what they are handed. */
function isCombinator(callee: ts.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "Promise" &&
    COMBINATORS.has(callee.name.text)
  )
}

/**
 * Whether the value `node` evaluates to comes from a foreign API: a foreign
 * name, a member of one, what calling or constructing one returns, or a
 * foreign `import()`. Follows where a value comes from, not what it is
 * handed, so `await post(subscription)` waits on `post`, ours, even when
 * `subscription` is foreign; `Promise.all([...])` waits on its elements.
 */
function fromForeign(
  node: ts.Expression,
  foreign: ReadonlySet<string>
): boolean {
  const value = unwrap(node)
  if (isForeignImport(value)) return true
  if (ts.isIdentifier(value)) return foreign.has(value.text)
  if (
    ts.isPropertyAccessExpression(value) ||
    ts.isElementAccessExpression(value) ||
    ts.isNewExpression(value) ||
    ts.isAwaitExpression(value)
  )
    return fromForeign(value.expression, foreign)
  if (ts.isCallExpression(value))
    return isCombinator(value.expression)
      ? value.arguments.some((argument) => fromForeign(argument, foreign))
      : fromForeign(value.expression, foreign)
  if (ts.isArrayLiteralExpression(value))
    return value.elements.some(
      (element) =>
        !ts.isOmittedExpression(element) &&
        fromForeign(
          ts.isSpreadElement(element) ? element.expression : element,
          foreign
        )
    )
  if (ts.isConditionalExpression(value))
    return (
      fromForeign(value.whenTrue, foreign) ||
      fromForeign(value.whenFalse, foreign)
    )
  if (
    ts.isBinaryExpression(value) &&
    [
      ts.SyntaxKind.QuestionQuestionToken,
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.AmpersandAmpersandToken,
    ].includes(value.operatorToken.kind)
  )
    return fromForeign(value.left, foreign) || fromForeign(value.right, foreign)
  return false
}

/** Every name a binding pattern declares. */
function boundNames(name: ts.BindingName): Array<string> {
  if (ts.isIdentifier(name)) return [name.text]
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : boundNames(element.name)
  )
}

function foreignNames(file: ts.SourceFile): Set<string> {
  const foreign = new Set<string>()
  const declared = new Set<string>()
  const declarations: Array<ts.VariableDeclaration> = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = node.importClause
      const names: Array<string> = []
      if (
        clause !== undefined &&
        clause.phaseModifier !== ts.SyntaxKind.TypeKeyword
      ) {
        if (clause.name !== undefined) names.push(clause.name.text)
        const bindings = clause.namedBindings
        if (bindings !== undefined && ts.isNamespaceImport(bindings))
          names.push(bindings.name.text)
        if (bindings !== undefined && ts.isNamedImports(bindings))
          for (const element of bindings.elements)
            if (!element.isTypeOnly) names.push(element.name.text)
      }
      for (const name of names) declared.add(name)
      if (FOREIGN_MODULE.test(node.moduleSpecifier.text))
        for (const name of names) foreign.add(name)
    }
    if (ts.isVariableDeclaration(node)) {
      declarations.push(node)
      for (const name of boundNames(node.name)) declared.add(name)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  // A file that declares `navigator` itself is not using the browser's.
  for (const global of FOREIGN_GLOBALS)
    if (!declared.has(global)) foreign.add(global)
  // Followed to a fixpoint: `const sqlite = new SQLiteConnection(Plugin)`,
  // then `const db = await sqlite.open()`.
  let grew = true
  while (grew) {
    grew = false
    for (const declaration of declarations) {
      if (
        declaration.initializer === undefined ||
        !fromForeign(declaration.initializer, foreign)
      )
        continue
      for (const name of boundNames(declaration.name)) {
        if (foreign.has(name)) continue
        foreign.add(name)
        grew = true
      }
    }
  }
  return foreign
}

/** The local names `callForeign` is imported under, and namespace imports. */
function boundaryNames(file: ts.SourceFile): {
  direct: Set<string>
  namespaces: Set<string>
} {
  const direct = new Set<string>()
  const namespaces = new Set<string>()
  for (const statement of file.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== BOUNDARY_MODULE
    )
      continue
    const bindings = statement.importClause?.namedBindings
    if (bindings === undefined) continue
    if (ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text)
    else
      for (const element of bindings.elements)
        if ((element.propertyName ?? element.name).text === BOUNDARY_EXPORT)
          direct.add(element.name.text)
  }
  return { direct, namespaces }
}

function isBoundaryCall(
  node: ts.Node,
  names: ReturnType<typeof boundaryNames>
): boolean {
  if (!ts.isCallExpression(node)) return false
  const callee = node.expression
  if (ts.isIdentifier(callee)) return names.direct.has(callee.text)
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    names.namespaces.has(callee.expression.text) &&
    callee.name.text === BOUNDARY_EXPORT
  )
}

/** What a site waits on, or null when `node` is not a site. */
function awaited(node: ts.Node): ts.Expression | null {
  if (ts.isAwaitExpression(node)) return node.expression
  if (ts.isForOfStatement(node) && node.awaitModifier !== undefined)
    return node.expression
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    PROMISE_CHAIN.has(node.expression.name.text)
  )
    return node.expression.expression
  return null
}

/** How many unbounded waits on a foreign API `source` has. */
export function foreignSites(path: string, source: string): number {
  const file = parseSource(path, source)
  const foreign = foreignNames(file)
  const boundary = boundaryNames(file)
  let sites = 0
  const visit = (node: ts.Node): void => {
    if (isBoundaryCall(node, boundary)) return
    const operand = awaited(node)
    if (
      operand !== null &&
      !isForeignImport(unwrap(operand)) &&
      fromForeign(operand, foreign)
    )
      sites += 1
    ts.forEachChild(node, visit)
  }
  visit(file)
  return sites
}

export type ForeignBoundaryViolation = CountViolation

export function findForeignBoundaryViolations(
  actual: ReadonlyMap<string, number>,
  allowlist: string
): Array<ForeignBoundaryViolation> {
  return findCountViolations(actual, allowlist, REASON)
}

/** F1 as `runCountedCheck` runs it (`scripts/check-foreign-boundary.ts`). */
export const FOREIGN_BOUNDARY_CHECK: CountedCheck = {
  tag: "foreign-boundary",
  id: "F1",
  allowlistFile: ALLOWLIST_FILE,
  reason: REASON,
  reasonLine: '"# Unbounded: <why>"',
  reasonHint:
    "Say why this wait on a foreign API needs no deadline, no classified failure and no report.",
  count: foreignSites,
  sites: "unbounded foreign waits",
  unlisted: (sites) =>
    `${sites} wait(s) on a foreign API (a native plugin, navigator, Notification) outside callForeign. Run it through callForeign from @some-ui/intent-kit (docs/monorepo-boundaries.md, F1)`,
  raised: "A new one goes through callForeign; if it truly needs no boundary,",
  staleAlso: "(or is gone)",
  counted: "files wait on a foreign API outside callForeign",
}

export function describeForeignBoundaryViolation(
  v: ForeignBoundaryViolation
): string {
  return describeCountViolation(FOREIGN_BOUNDARY_CHECK, v)
}
