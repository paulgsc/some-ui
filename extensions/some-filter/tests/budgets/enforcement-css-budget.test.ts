/**
 * Layer 2 of the browser-unresponsive guard: a selector cost budget over the
 * CSS `adapter/enforcement-sheet.ts` actually builds.
 *
 * Read `tests/budgets/README.md` first for what this directory is blocking
 * and why a failure here is a release blocker rather than a tuning note.
 *
 * ── what this suite is for ───────────────────────────────────────────────
 *
 * The enforcement sheet is injected at the CSS **user origin** into every
 * page the user visits (`chrome.scripting.insertCSS({ origin: "USER" })`),
 * with `<all_urls>` host permissions. Its `!important` declarations outrank
 * the vendor's own, by design. That reach is the point of the mechanism and
 * it is also why its selectors are not a matter of taste: a selector whose
 * match or invalidation cost scales with document size does not degrade
 * gracefully on a dense page, it hangs the tab — and it hangs it on *every*
 * page, including ones this extension was never tested against.
 *
 * The sheet is built by string concatenation in TypeScript, so stylelint
 * never sees it (`pnpm lint:style` globs `**\/*.css`; this text is never a
 * file). `tests/budgets/selector-cost.ts` is the substitute: a real CSS
 * parse and an explicit cost model. Its header documents the three cost
 * drivers and why each weight is what it is; this file only applies them.
 *
 * ── relationship to `src/adapter/__tests__/enforcement-sheet.test.ts` ─────
 *
 * That suite pins the sheet's current *shape* — including a case ("erases
 * without reading") that asserts the erase selector is literally
 * `*:not(img):not(video):not(svg):not(canvas)`. This suite says that shape
 * is a hang. The two are deliberately left contradicting each other rather
 * than one being quietly deleted: the contradiction *is* the finding, and
 * whoever fixes the selector has to update both, which is exactly the
 * review conversation that should happen. Do not "fix" this file by
 * relaxing a budget to match the sheet — the budgets here are derived from
 * how engines match, not from what this sheet currently happens to do.
 */

import { buildEnforcementCSS } from "@filter/adapter/enforcement-sheet"
import { SWATCHES, type Swatch } from "@filter/adapter/swatches"
import { EXT_GUARD } from "@filter/lib/content/theme-apply"
import { describe, expect, it } from "vitest"

import {
  analyzeSelector,
  analyzeStylesheet,
  MAX_SELECTOR_COST,
  report,
  type SelectorCost,
} from "./selector-cost"

const swatch: Swatch = SWATCHES.default
const costs: ReadonlyArray<SelectorCost> = analyzeStylesheet(
  buildEnforcementCSS(swatch)
)

describe("enforcement sheet — selector cost budget", () => {
  it("parses into a non-trivial set of selectors (guards against a silently empty analysis)", () => {
    // A budget suite that analyzes nothing passes vacuously, which is the
    // one failure mode that would make every case below meaningless.
    expect(costs.length).toBeGreaterThan(10)
  })

  it("has no selector whose subject can match every element in the document", () => {
    const violations = costs.filter((c) => c.universalSubject)

    expect(
      violations,
      `\n${violations.length} selector(s) match every element in the document on ` +
        `every style recalculation. On a GitHub "Files changed" page (N files x M ` +
        `lines, routinely >100k nodes) that is a full-tree walk per recalculation, ` +
        `on the main thread, for the life of the tab:\n\n${report(violations)}\n\n` +
        `Constrain the subject (a tag, class, id or attribute) instead of ` +
        `filtering an unbounded candidate set with :not().\n`
    ).toEqual([])
  })

  it("has no selector whose match result depends on how many siblings an element has", () => {
    const violations = costs.filter((c) => c.siblingCountingPseudos.length > 0)

    expect(
      violations,
      `\n${violations.length} selector(s) use a sibling-counting pseudo-class. An ` +
        `element's own match result then depends on its sibling count, so every ` +
        `single child insertion or removal forces the engine to re-evaluate that ` +
        `element's entire sibling list. A diff view expanding a file, or any ` +
        `streaming list, turns one mutation into a tree-wide restyle:\n\n` +
        `${report(violations)}\n\n` +
        `:first-child / :last-child / :first-of-type / :last-of-type are answered ` +
        `from one adjacent sibling and are NOT banned — only the counting ones are.\n`
    ).toEqual([])
  })

  it("has no selector using :has()", () => {
    const violations = costs.filter((c) => c.hasCount > 0)

    expect(
      violations,
      `\n:has() invalidates on every mutation within its argument's reach, which ` +
        `on a broad subject is the whole tree. enforcement-sheet.ts's own ` +
        `LIFT_SELECTOR comment already rejects it for exactly this reason — this ` +
        `case keeps a future diff from reintroducing it:\n\n${report(violations)}\n`
    ).toEqual([])
  })

  it(`keeps every selector within the per-selector cost budget of ${MAX_SELECTOR_COST}`, () => {
    const violations = costs.filter((c) => c.cost > MAX_SELECTOR_COST)

    expect(
      violations,
      `\n${violations.length} selector(s) exceed the cost budget of ` +
        `${MAX_SELECTOR_COST}. See tests/budgets/selector-cost.ts for the model ` +
        `and the weights:\n\n${report(violations)}\n`
    ).toEqual([])
  })

  it("is cost-stable across swatches (a swatch may change colors, never selectors)", () => {
    // The sheet interpolates swatch tokens into *declarations* only. If a
    // future swatch ever reached a selector, the whole budget above would
    // only be checked against whichever swatch this file happens to name.
    const perSwatch = Object.values(SWATCHES).map((s) =>
      analyzeStylesheet(buildEnforcementCSS(s))
        .map((c) => c.selector)
        .join("\n")
    )
    expect(new Set(perSwatch).size).toBe(1)
  })
})

describe("EXT_GUARD — the shipped ancestor-dependent suffix", () => {
  // EXT_GUARD is `:not([data-my-ext]):not([data-my-ext] *)`, appended to
  // every highlight-table row so this extension never repaints its own DOM.
  // Its second clause carries a descendant combinator, so it costs an
  // ancestor check per candidate — real, already shipped, and deliberately
  // left inside the budget rather than banned.
  //
  // This case exists so that headroom cannot be spent silently. If EXT_GUARD
  // grows another clause, or picks up a sibling-counting pseudo, the rows
  // that carry it stop fitting under MAX_SELECTOR_COST and this fails first,
  // naming the shared constant rather than the fifteen rules downstream of it.
  it("leaves a tag-constrained row inside the budget", () => {
    const guarded = analyzeSelector(`:where(p, span, li)${EXT_GUARD}`)

    expect(
      guarded.cost,
      `EXT_GUARD (${EXT_GUARD}) now costs enough that an ordinary ` +
        `:where(<tags>) highlight row no longer fits the budget ` +
        `(${guarded.cost} > ${MAX_SELECTOR_COST}). Every row in HIGHLIGHT_TABLE ` +
        `carries this suffix, so this is one change with fifteen call sites.`
    ).toBeLessThanOrEqual(MAX_SELECTOR_COST)

    // And it must stay ancestor-dependent-but-constrained: the guard must
    // never be the thing that makes a row's subject universal.
    expect(guarded.universalSubject).toBe(false)
    expect(guarded.siblingCountingPseudos).toEqual([])
  })
})
