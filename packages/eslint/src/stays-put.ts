// HS3 (docs/ui-fit/README.md, "2j"): what a phone screen says about what was
// just done is said on the notice plane (`<Notice>`, @some-ui/shared), never
// in the screen's layout. Every phone source that draws an error or status
// line in its layout is listed in `scripts/notices.allowlist` at its exact
// count, under `Content:` (the line is the screen's own content, not news of
// a tap) or `Grandfathered:` (it predates the rule, and only shrinks). A
// count, as R1 and F1 are (site-count.ts), for the reason 2j gives.
//
// A site, in a `.tsx`/`.jsx` phone source (`./phone-sources.ts`), is a JSX
// element with `role="alert"` or `role="status"` (a string, or a string in
// braces), or the shared `<Alert>`, whose role is alert; never a `<Notice>`,
// which takes `role` to say it on the plane.
//
// Known blind spots, each the reviewer's and the walk's: a line with no role
// (give it one, or say it with `Notice`); a role set by a spread or a
// variable; text that changes length inside an element that stays.
import ts from "typescript"

import { phoneSources } from "./phone-sources.ts"
import type { CountedCheck, CountViolation } from "./site-count.ts"
import { findCountViolations, parseSource, unwrap } from "./site-count.ts"

const ALLOWLIST_FILE = "scripts/notices.allowlist"

const REASON = /^#\s*(?:Content|Grandfathered):\s*\S/

const JSX_SOURCE = /\.[jt]sx$/
const MESSAGE_ROLES: ReadonlySet<string> = new Set(["alert", "status"])

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

/** An opening tag that draws an error or status line in the layout. */
function isLineInLayout(
  opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement
): boolean {
  if (!ts.isIdentifier(opening.tagName)) return false
  const tag = opening.tagName.text
  if (tag === "Notice") return false
  if (tag === "Alert") return true
  const role = roleOf(opening.attributes)
  return role !== null && MESSAGE_ROLES.has(role)
}

/** How many error or status lines `source` draws in its layout; null if not JSX. */
export function staysPutSites(path: string, source: string): number | null {
  if (!JSX_SOURCE.test(path)) return null
  let sites = 0
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      isLineInLayout(node)
    )
      sites += 1
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

/** HS3 as `runCountedCheck` runs it (`scripts/check-stays-put.ts`). */
export const STAYS_PUT_CHECK: CountedCheck = {
  tag: "stays-put",
  id: "HS3",
  doc: "docs/ui-fit/README.md",
  allowlistFile: ALLOWLIST_FILE,
  reason: REASON,
  reasonLine: '"# Content: <what the line is part of>"',
  reasonHint:
    "Say what screen content the line is (a figure, a count), and why it is not news of a tap.",
  count: staysPutSites,
  scope: phoneSources,
  sites: "error/status lines in the layout",
  unlisted: (sites) =>
    `a phone surface that draws ${sites} error/status line(s) in its layout, not in ${ALLOWLIST_FILE}. What a screen says about what was just done goes on the notice plane, over the screen: say it with <Notice role=…> (@some-ui/shared, HS1)`,
  raised: "More lines in the layout: if each is screen content,",
  staleAlso: "(or is gone, or is no longer a phone surface)",
  counted: "phone surfaces draw error/status lines in their layout",
}
