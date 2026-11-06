// HS2 (docs/ui-fit/README.md, "2j"): on a phone surface, every error or
// status line mounted on a condition is listed in `scripts/stays-put.allowlist`
// at its file's exact count, under a comment that says why it moves nothing
// (`Placement:`) or that it predates the rule (`Grandfathered:`). The way out
// is not to mount it: `Reserved` (@some-ui/shared) keeps the line's room and
// its live region whether it says something or not (HS1).
//
// A count, as R1 and F1 are (site-count.ts), because whether a line moves a
// control is layout: a line after the last control of a page that grows down
// moves nothing, and the same line above a keypad moves every key. No AST can
// tell those apart, so the allowlist hunk is where a reviewer reads the
// `Placement:` claim, and stays-put.spec.ts is where a walk measures it.
//
// What is a site, in a `.tsx`/`.jsx` file:
// - `cond && <X …/>`, where X is a message;
// - `cond ? <X …/> : null` (or `undefined`, `false`), either way round;
// - a `return <X …/>` in a function that also returns nothing (`null`,
//   `undefined`, `false`, or a bare `return`): a component that is its own
//   condition, such as `Problem` returning null until there is one.
// A message is a JSX element with `role="alert"` or `role="status"` (a string,
// or a string in braces), or the shared `<Alert>`, whose role is alert.
//
// Known blind spots, each the reviewer's and the walk's:
// - a message with no role (a hint, a warning in plain text): give it one,
//   since a line that comes on a tap is news a screen reader should hear;
// - one element swapped for another of a different size (`a ? <A/> : <B/>`);
// - a wrapper mounted conditionally around a message
//   (`cond && <div><p role="alert"/></div>`);
// - text that changes length inside a mounted element.
//
// Scope: phone surfaces, which is every `packages/ui/*` workspace whose
// `someUi.audience` reaches the phone, and `apps/www/src`. A `web` or `lan`
// workspace is not shown on the phone (packages/some-vite-config/AUDIENCES.md);
// stays-put.test.ts holds this list to the manifests.
import ts from "typescript"

import type { CountedCheck, CountViolation } from "./site-count.ts"
import { findCountViolations, parseSource } from "./site-count.ts"

const ALLOWLIST_FILE = "scripts/stays-put.allowlist"

const REASON = /^#\s*(?:Placement|Grandfathered):\s*\S/

/** `packages/ui` workspaces the phone never shows: audience `web` or `lan`. */
export const NOT_ON_THE_PHONE: ReadonlySet<string> = new Set([
  "burn-ins",
  "honeycomb",
  "lesson-crm",
  "playoff-delta",
])

const JSX_SOURCE = /\.[jt]sx$/
const UI_WORKSPACE = /^packages\/ui\/(?<name>[^/]+)\/src\//
const MESSAGE_ROLES: ReadonlySet<string> = new Set(["alert", "status"])

/** Whether `path` is source a phone surface is drawn from. */
export function onThePhone(path: string): boolean {
  if (!JSX_SOURCE.test(path)) return false
  if (path.startsWith("apps/www/src/")) return true
  const name = UI_WORKSPACE.exec(path)?.groups?.["name"]
  return name !== undefined && !NOT_ON_THE_PHONE.has(name)
}

function unwrap(node: ts.Expression): ts.Expression {
  let at = node
  while (ts.isParenthesizedExpression(at)) at = at.expression
  return at
}

function roleOf(attributes: ts.JsxAttributes): string | null {
  for (const property of attributes.properties) {
    if (
      !ts.isJsxAttribute(property) ||
      !ts.isIdentifier(property.name) ||
      property.name.text !== "role"
    )
      continue
    const value = property.initializer
    if (value === undefined) return null
    if (ts.isStringLiteral(value)) return value.text
    const inner =
      ts.isJsxExpression(value) && value.expression !== undefined
        ? unwrap(value.expression)
        : null
    if (inner !== null && ts.isStringLiteralLike(inner)) return inner.text
  }
  return null
}

/** A JSX element that is an error or status line. */
function isMessage(node: ts.Expression): boolean {
  const at = unwrap(node)
  const opening = ts.isJsxElement(at)
    ? at.openingElement
    : ts.isJsxSelfClosingElement(at)
      ? at
      : null
  if (opening === null) return false
  if (ts.isIdentifier(opening.tagName) && opening.tagName.text === "Alert")
    return true
  const role = roleOf(opening.attributes)
  return role !== null && MESSAGE_ROLES.has(role)
}

/** `null`, `undefined` or `false`: what renders nothing. */
function isNothing(node: ts.Expression | undefined): boolean {
  if (node === undefined) return true
  const at = unwrap(node)
  return (
    at.kind === ts.SyntaxKind.NullKeyword ||
    at.kind === ts.SyntaxKind.FalseKeyword ||
    (ts.isIdentifier(at) && at.text === "undefined")
  )
}

/** The `return`s that belong to `body` itself, not to a function inside it. */
function ownReturns(body: ts.Node): Array<ts.ReturnStatement> {
  const found: Array<ts.ReturnStatement> = []
  const visit = (node: ts.Node): void => {
    if (ts.isReturnStatement(node)) found.push(node)
    if (ts.isFunctionLike(node)) return
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(body, visit)
  return found
}

/** How many messages `source` mounts on a condition; null off the phone. */
export function staysPutSites(path: string, source: string): number | null {
  if (!onThePhone(path)) return null
  let sites = 0
  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      isMessage(node.right)
    )
      sites += 1
    if (
      ts.isConditionalExpression(node) &&
      ((isMessage(node.whenTrue) && isNothing(node.whenFalse)) ||
        (isMessage(node.whenFalse) && isNothing(node.whenTrue)))
    )
      sites += 1
    if (
      ts.isFunctionLike(node) &&
      "body" in node &&
      node.body !== undefined &&
      ts.isBlock(node.body)
    ) {
      const returns = ownReturns(node.body)
      if (returns.some((r) => isNothing(r.expression)))
        sites += returns.filter(
          (r) => r.expression !== undefined && isMessage(r.expression)
        ).length
    }
    ts.forEachChild(node, visit)
  }
  visit(parseSource(path, source))
  return sites
}

/** Compares the sites found against the allowlist. */
export function findStaysPutViolations(
  actual: ReadonlyMap<string, number>,
  allowlist: string
): Array<CountViolation> {
  return findCountViolations(actual, allowlist, REASON)
}

/** HS2 as `runCountedCheck` runs it (`scripts/check-stays-put.ts`). */
export const STAYS_PUT_CHECK: CountedCheck = {
  tag: "stays-put",
  id: "HS2",
  doc: "docs/ui-fit/README.md",
  allowlistFile: ALLOWLIST_FILE,
  reason: REASON,
  reasonLine: '"# Placement: <why it moves nothing>"',
  reasonHint:
    "Say why mounting this line moves no control: it comes after the last one on a page that grows down, or it replaces the whole screen.",
  count: staysPutSites,
  sites: "conditionally mounted error/status lines",
  unlisted: (sites) =>
    `a phone surface that mounts ${sites} error/status line(s) on a condition, not in ${ALLOWLIST_FILE}. A line that comes on a tap moves the controls after it: keep its room with <Reserved role=…> (@some-ui/shared, HS1)`,
  raised: "More lines mounted on a condition: if each moves nothing,",
  staleAlso: "(or is gone, or is no longer a phone surface)",
  counted: "phone surfaces mount error/status lines",
}
