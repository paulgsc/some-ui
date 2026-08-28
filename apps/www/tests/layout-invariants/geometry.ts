/**
 * Reusable geometry invariants for the fixture-mirror specs next door
 * (`tests/session-viewport`, `tests/ui-fit`) - proposed on #1192 as a
 * general-purpose layer, not a one-off assertion for that PR's badge bug.
 *
 * The grammar these follow: don't regression-test the CSS declaration that
 * fixes one instance, regression-test the geometric property the
 * declaration is supposed to preserve. Three properties, each independent
 * of the others and each catching a different family of regressions:
 *
 *   1. `expectNoHorizontalOverflow` - the page (or a given container) never
 *      grows wider than its own box. Catches unbounded intrinsic sizing,
 *      missing `min-w-0` on a flex child, an oversized child with no wrap
 *      escape valve.
 *   2. `expectContainedLayouts` - descendants of an element opted in via
 *      `data-layout-contained` stay inside that element's box. Opt-in
 *      rather than a blanket "no child exceeds parent" crawler: CSS
 *      legitimately lets popovers, tooltips, shadows and transformed
 *      elements escape their parent's content box, so asserting that
 *      globally would just generate noise.
 *   3. `expectSingleLineText` - a matched element's own text renders on one
 *      line. This is the one #1192's actual bug needed and the other two
 *      don't cover: `Badge` wrapping its text internally when it isn't
 *      given `whitespace-nowrap` doesn't overflow anything or escape its
 *      parent - the box just shrinks to a tall, narrow, wrapped shape. The
 *      failure mode is "wrong shape", not "escaped its box".
 */

import type { Page } from "@playwright/test"

/** Canonical mobile width matrix. Chosen to probe layout phase transitions
 * (where a flex row runs out of room, where a breakpoint flips) rather than
 * to represent specific device models. */
export const MOBILE_WIDTHS: ReadonlyArray<{ name: string; width: number }> = [
  { name: "320", width: 320 },
  { name: "360", width: 360 },
  { name: "390", width: 390 },
  { name: "430", width: 430 },
]

export type OverflowViolation = {
  tag: string
  text: string
  left: number
  right: number
  width: number
}

/**
 * Every element whose rendered box escapes the viewport (or `containerSelector`,
 * if given) horizontally. `position: fixed` elements are exempt - they are
 * declared out of document flow entirely, not a containment failure.
 */
export async function findHorizontalOverflow(
  page: Page,
  containerSelector?: string
): Promise<Array<OverflowViolation>> {
  return page.evaluate((selector: string | undefined) => {
    const container = selector ? document.querySelector(selector) : null
    if (selector && !container) return []

    const bounds = container
      ? container.getBoundingClientRect()
      : { left: 0, right: document.documentElement.clientWidth }

    // Scoped to the container's own subtree when one is given - scanning
    // `body *` regardless would flag the container's wider ancestors and
    // unrelated siblings as "overflow" too, since they naturally sit
    // outside a narrower container's bounds without actually being
    // contained by it.
    const root = container ?? document.body
    const violations: Array<OverflowViolation> = []
    for (const element of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
      const style = getComputedStyle(element)
      if (style.position === "fixed") continue

      const rect = element.getBoundingClientRect()
      if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) {
        violations.push({
          tag: element.tagName.toLowerCase(),
          text: element.textContent.trim().slice(0, 80),
          left: rect.left,
          right: rect.right,
          width: rect.width,
        })
      }
    }
    return violations
  }, containerSelector)
}

/** Asserts nothing on the page (or within `containerSelector`) escapes
 * horizontally. Throws with every offender listed, not just the first. */
export async function expectNoHorizontalOverflow(
  page: Page,
  containerSelector?: string
): Promise<void> {
  const violations = await findHorizontalOverflow(page, containerSelector)
  if (violations.length === 0) return

  const detail = violations
    .map(
      (v) =>
        `  <${v.tag}> "${v.text}" right=${v.right.toFixed(1)} ` +
        `(bound=${(containerSelector ? "container" : "viewport").toString()})`
    )
    .join("\n")
  throw new Error(
    `${violations.length} element(s) overflow horizontally:\n${detail}`
  )
}

type ContainmentViolation = {
  parent: string
  child: string
  overflowLeft: number
  overflowRight: number
}

/**
 * For every element carrying `data-layout-contained`, every non-exempt
 * descendant must stay inside that element's content box. Exempt: elements
 * whose geometry is deliberately detached from normal flow (`fixed`,
 * `absolute`, `display: none`) - popovers, tooltips, and similar overlays
 * are not containment failures.
 */
async function findContainmentViolations(
  page: Page,
  tolerance = 1
): Promise<Array<ContainmentViolation>> {
  return page.evaluate((tolerance: number) => {
    const violations: Array<ContainmentViolation> = []

    for (const parent of Array.from(
      document.querySelectorAll<HTMLElement>("[data-layout-contained]")
    )) {
      const p = parent.getBoundingClientRect()

      for (const child of Array.from(
        parent.querySelectorAll<HTMLElement>("*")
      )) {
        const style = getComputedStyle(child)
        if (
          style.position === "fixed" ||
          style.position === "absolute" ||
          style.display === "none"
        ) {
          continue
        }

        const c = child.getBoundingClientRect()
        const overflowLeft = p.left - c.left
        const overflowRight = c.right - p.right
        if (overflowLeft > tolerance || overflowRight > tolerance) {
          violations.push({
            parent: parent.outerHTML.slice(0, 150),
            child: child.outerHTML.slice(0, 150),
            overflowLeft,
            overflowRight,
          })
        }
      }
    }

    return violations
  }, tolerance)
}

/** Asserts every `[data-layout-contained]` element's descendants stay
 * inside its box. */
export async function expectContainedLayouts(
  page: Page,
  tolerance = 1
): Promise<void> {
  const violations = await findContainmentViolations(page, tolerance)
  if (violations.length === 0) return

  const detail = violations
    .map(
      (v) =>
        `  parent: ${v.parent}\n  child:  ${v.child}\n` +
        `  overflowLeft=${v.overflowLeft.toFixed(1)} overflowRight=${v.overflowRight.toFixed(1)}`
    )
    .join("\n\n")
  throw new Error(
    `${violations.length} layout-containment violation(s):\n\n${detail}`
  )
}

/**
 * Counts the rendered line boxes a `selector` match's own text occupies, via
 * `Range.getClientRects()` - each wrapped line produces its own client rect,
 * so more than one means the text wrapped inside its element rather than
 * being clipped/ellipsized or fitting on one line. This is the invariant a
 * `whitespace-nowrap` pill actually promises, and the one plain overflow/
 * containment checks don't catch: wrapped text that still fits inside its
 * box (just as a taller, narrower shape) triggers neither of those.
 */
export async function countTextLines(
  page: Page,
  selector: string
): Promise<Array<number>> {
  return page.evaluate((sel: string) => {
    return Array.from(document.querySelectorAll<HTMLElement>(sel)).map(
      (element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const rects = Array.from(range.getClientRects())
          // A trailing empty rect (zero width) after the last glyph is
          // normal and not a second line.
          .filter((r) => r.width > 0.5)
          .sort((a, b) => a.top - b.top)

        // Nested inline markup (an icon before the text, a <strong> span,
        // …) can produce more than one client rect on the *same* visual
        // line - counting rects directly over-reports wrapping for exactly
        // the badges this invariant exists to check (an icon + label).
        // Cluster instead: a new line only starts once a rect's top is
        // meaningfully below the current line's, not merely different from
        // baseline/font-metric jitter between adjacent inline boxes.
        const LINE_TOLERANCE_PX = 2
        let lines = 0
        let currentLineTop = Number.NEGATIVE_INFINITY
        for (const rect of rects) {
          if (rect.top - currentLineTop > LINE_TOLERANCE_PX) {
            lines += 1
            currentLineTop = rect.top
          }
        }
        return lines
      }
    )
  }, selector)
}

/** Asserts every element matching `selector` renders its text on exactly
 * one line. */
export async function expectSingleLineText(
  page: Page,
  selector: string
): Promise<void> {
  const lineCounts = await countTextLines(page, selector)
  const offenders = lineCounts
    .map((count, index) => ({ count, index }))
    .filter(({ count }) => count > 1)

  if (offenders.length === 0) return

  throw new Error(
    `${offenders.length} of ${lineCounts.length} element(s) matching ` +
      `"${selector}" wrapped onto multiple lines: ${offenders
        .map((o) => `#${o.index} (${o.count} lines)`)
        .join(", ")}`
  )
}
