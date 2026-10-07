// R1 (docs/monorepo-boundaries.md, "Inside a React package: the component is
// not the coordinator"): every React module that awaits or chains a promise is
// listed in `scripts/react-coordination.allowlist`, with exactly how many such
// sites it has, under a comment block that says why (`Coordination:`) or that
// it predates the rule (`Grandfathered:`).
//
// A count, not a verdict. Whether a component has become the place where the
// application's asynchronous behaviour is coordinated is a judgment no AST
// can make: one awaited mutation in a submit handler is fine, and nine
// interleaved awaits over a microphone, a database and an `Audio` are not. So
// this check never claims a violation of the idiom. It makes every change in
// how much a React module coordinates show up as a line in the diff, and the
// allowlist hunk is where a reviewer applies R1's falsifier, the way the
// RS1_FINGERPRINT bump is in workflow-guards.ts and the allow-list is in
// scripts/check-mutation-boundary.sh (Axiom 12.1, the Rust side of the same
// idea).
//
// What counts as a site: an `await` expression, a `for await` loop, and a
// call to `.then`, `.catch` or `.finally`. What counts as a React module: any
// `.jsx`/`.tsx` file; any other source file whose ES `import` or
// `export ... from` names a React library (`react`, `react-dom`, or a binding
// such as `@tanstack/react-query`); and any that declares or calls a hook, by
// the `use` + capital naming convention eslint-plugin-react-hooks also goes
// by: `function useX`, any variable declared `useX` (`const`, `let` or `var`,
// with or without an initializer), `useX()`, `Namespace.useX()`. So moving
// nine awaits from a component into `useRecorder()` moves nothing out of
// React, and a hook built only on other hooks counts too. Tests, stories,
// fixtures, generated files and declarations are out of scope.
//
// The classification is that syntax and nothing more, on purpose: R1 cannot
// claim to find every way a module reaches React, so it claims these shapes.
// A module whose only link to React is a hook renamed away from the
// convention (`import { useX as readX }`), called through a lowercase object
// (`hooks.useX()`), or loaded with CommonJS `require("react")` is not
// counted. The first two break the naming convention the rules-of-hooks lint
// already depends on; the third has no instance in scope (every React module
// here is ES). Each is the reviewer's to flag, not this count's to chase.
//
// Known blind spot: a fire-and-forget call (`void save()`) is not a site.
// Counting `void <call>` would sweep in every `void navigate(...)` and query
// prefetch, which is adapter wiring, so it stays with the reviewer.
//
// Exact match, both ways: a count that falls must be lowered in the same
// change too, so the pin always says what is there and a later rise is
// visible against it. Parsed with the TypeScript compiler, not a regex: a
// word "await" in JSX text or a comment is not a site.
import ts from "typescript"

import type { CountedCheck, CountViolation } from "./site-count.ts"
import {
  describeCountViolation,
  findCountViolations,
  isInScope,
  parseCountAllowlist,
  parseSource,
  PROMISE_CHAIN,
} from "./site-count.ts"

export { isInScope }

const ALLOWLIST_FILE = "scripts/react-coordination.allowlist"

const JSX_SOURCE = /\.[jt]sx$/
// `react`, `react-dom`, their subpaths, and bindings named for React:
// `@tanstack/react-query`, `react-hook-form`, `lucide-react`.
const REACT_LIBRARY = /(?:^|\/)react(?:-[^/]*)?(?:\/|$)|-react(?:\/|$)/
const HOOK_NAME = /^use[A-Z0-9]/
const NAMESPACE = /^[A-Z]/
const REASON = /^#\s*(?:Coordination|Grandfathered):\s*\S/

function importsReact(file: ts.SourceFile): boolean {
  return file.statements.some(
    (statement) =>
      (ts.isImportDeclaration(statement) ||
        ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      REACT_LIBRARY.test(statement.moduleSpecifier.text)
  )
}

/**
 * A hook declared (`function useX`, a variable `useX`) or called: `useX()`,
 * or `Namespace.useX()` on a PascalCase namespace (`React.useState`,
 * `Hooks.useSession`), the same call shapes eslint-plugin-react-hooks treats
 * as hooks. So `vi.useFakeTimers()` is not one.
 */
function isHook(node: ts.Node): boolean {
  if (ts.isFunctionDeclaration(node))
    return node.name !== undefined && HOOK_NAME.test(node.name.text)
  // Whatever the initializer: a factory's result (`createQueryHook(...)`,
  // zustand's `create(...)`) is as much a hook as an arrow function.
  if (ts.isVariableDeclaration(node))
    return ts.isIdentifier(node.name) && HOOK_NAME.test(node.name.text)
  if (!ts.isCallExpression(node)) return false
  const callee = node.expression
  if (ts.isIdentifier(callee)) return HOOK_NAME.test(callee.text)
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    NAMESPACE.test(callee.expression.text) &&
    HOOK_NAME.test(callee.name.text)
  )
}

/** Whether `node` or anything under it is a hook; stops at the first. */
function hasHook(node: ts.Node): boolean {
  return isHook(node) || ts.forEachChild(node, hasHook) === true
}

function isSite(node: ts.Node): boolean {
  if (ts.isAwaitExpression(node)) return true
  if (ts.isForOfStatement(node) && node.awaitModifier !== undefined) return true
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    PROMISE_CHAIN.has(node.expression.name.text)
  )
}

/**
 * How many coordination sites `source` has, or null when it is not a React
 * module (and so is not R1's concern at all).
 */
export function coordinationSites(path: string, source: string): number | null {
  const file = parseSource(path, source)
  if (!JSX_SOURCE.test(path) && !importsReact(file) && !hasHook(file))
    return null
  let sites = 0
  const visit = (node: ts.Node): void => {
    if (isSite(node)) sites += 1
    ts.forEachChild(node, visit)
  }
  visit(file)
  return sites
}

/**
 * Entries are `<sites> <path>` lines. A blank line ends a group, and every
 * entry is reasoned by its group's `#` lines: one of them must start
 * `Coordination:` (why this module coordinates) or `Grandfathered:` (it did
 * before R1, and is debt).
 */
export function parseAllowlist(
  text: string
): ReturnType<typeof parseCountAllowlist> {
  return parseCountAllowlist(text, REASON)
}

export type CoordinationViolation = CountViolation

/**
 * Compares the sites found (`actual`: every in-scope React module with at
 * least one site; modules with none are left out) against the allowlist.
 */
export function findCoordinationViolations(
  actual: ReadonlyMap<string, number>,
  allowlist: string
): Array<CoordinationViolation> {
  return findCountViolations(actual, allowlist, REASON)
}

/** R1 as `runCountedCheck` runs it (`scripts/check-react-coordination.ts`). */
export const COORDINATION_CHECK: CountedCheck = {
  tag: "react-coordination",
  id: "R1",
  allowlistFile: ALLOWLIST_FILE,
  reason: REASON,
  reasonLine: '"# Coordination: <why>"',
  reasonHint:
    "Say why this React module coordinates async work instead of a runtime outside React doing it.",
  count: coordinationSites,
  sites: "await/promise-chain sites",
  unlisted: (sites) =>
    `a React module with ${sites} await/promise-chain site(s), not in ${ALLOWLIST_FILE}. Either move the coordination out of React (docs/monorepo-boundaries.md, R1)`,
  raised: "More coordination in a React module: if it belongs there,",
  staleAlso: "(or is gone, or is no longer a React module)",
  counted: "React modules coordinate",
}

export function describeCoordinationViolation(
  v: CoordinationViolation
): string {
  return describeCountViolation(COORDINATION_CHECK, v)
}
