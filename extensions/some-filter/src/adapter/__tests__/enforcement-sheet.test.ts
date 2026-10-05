import {
  buildEnforcementCSS,
  ENFORCEMENT_SENTINEL_PROPERTY,
} from "@filter/adapter/enforcement-sheet"
import { SWATCHES } from "@filter/adapter/swatches"
import { describe, expect, it } from "vitest"

const swatch = SWATCHES.default

const ERASE_RULE =
  "*:not(img):not(video):not(svg):not(canvas):not([data-my-ext]):not(:where([data-my-ext] *)) {"
const GUARDED = ":where(*:not([data-my-ext]):not([data-my-ext] *))"
const GUARD = ":not([data-my-ext]):not([data-my-ext] *)"
const TEXT_BLOCK =
  ":where(p, h1, h2, h3, h4, h5, h6, li, blockquote, dd, dt, figcaption, caption)"
const TEXT_PSEUDO_RULE = `${TEXT_BLOCK}${GUARD}::first-letter`
const CANVAS_RULE = ":root:root, :root:root body {"

/** Pure, so one build serves every test of the default swatch. */
const css = buildEnforcementCSS(swatch)

/** The declaration block of the first rule whose selector starts with `head`. */
function ruleBody(head: string, sheet = css): string {
  const start = css.indexOf(head)
  expect(start, `no rule starting ${head}`).toBeGreaterThan(-1)
  return sheet.slice(start, sheet.indexOf("}", start))
}

const liftBlock = (): string =>
  (css.match(/:where\(:is\([^)]*\)[^{]*\{[^}]*\}/) ?? [""])[0]

describe("buildEnforcementCSS", () => {
  it("is pure — identical output for the same swatch", () => {
    expect(buildEnforcementCSS(swatch)).toBe(buildEnforcementCSS(swatch))
  })

  it("produces balanced braces (a malformed rule would starve every rule after it)", () => {
    const opens = (css.match(/{/g) ?? []).length
    const closes = (css.match(/}/g) ?? []).length
    expect(opens).toBe(closes)
    expect(opens).toBeGreaterThan(0)
  })

  it("boosts the canvas rule (§3.2) — :root:root, never a bare html/body", () => {
    expect(css).toContain(":root:root, :root:root body")
    expect(css).not.toMatch(/(?<!:root)\bhtml\s*,\s*body\b/)
  })

  it("declares the presence sentinel on the canvas rule, carrying the swatch id (a colour cannot prove the sheet is there)", () => {
    for (const s of [swatch, SWATCHES["purple-gray"]]) {
      const rule = ruleBody(CANVAS_RULE, buildEnforcementCSS(s))
      expect(rule).toContain(
        `${ENFORCEMENT_SENTINEL_PROPERTY}: ${s.id} !important;`
      )
    }
    expect(ENFORCEMENT_SENTINEL_PROPERTY.startsWith("--")).toBe(true)
  })

  it("neutralizes a root-level vendor filter on the canvas rule (html { filter: invert(1) } would invert E back to light)", () => {
    expect(ruleBody(CANVAS_RULE)).toContain("filter: none !important;")
  })

  it("erases inset box-shadows and descendant filters on every non-media element", () => {
    for (const rule of [ruleBody(ERASE_RULE), ruleBody(`${GUARDED}::before`)]) {
      expect(rule).toContain("box-shadow: none !important;")
      expect(rule).toContain("filter: none !important;")
      expect(rule).toContain("backdrop-filter: none !important;")
    }
  })

  it("erases text-shadows and imposes outline-color on both erase rules", () => {
    const erase = ruleBody(ERASE_RULE)
    // Colour only — width and style stay the vendor's, like border-color.
    expect(erase).not.toMatch(/outline-(width|style|offset)/)
    expect(erase).not.toMatch(/^\s*outline:/m)
    for (const rule of [erase, ruleBody(`${GUARDED}::before`)]) {
      expect(rule).toContain("text-shadow: none !important;")
      expect(rule).toContain(
        `outline-color: ${swatch.borderStrong} !important;`
      )
    }
  })

  it("imposes a dark top-layer ::backdrop, excluding the veil's own", () => {
    const rule = ruleBody(`${GUARDED}::backdrop {`)
    expect(rule).toContain("background-color: rgba(0, 0, 0, 0.6) !important;")
    expect(rule).not.toContain("transparent")
    // The backdrop's own independent channels.
    expect(rule).toContain("box-shadow: none !important;")
    expect(rule).toContain("backdrop-filter: none !important;")
  })

  it("erases without reading — the erase selector carries no swatch-specific token", () => {
    expect(css).toContain("*:not(img):not(video):not(svg):not(canvas)")
    expect(css).toContain("background-image: none !important")
  })

  it("uses borderStrong (ADR 0002 §2.3), not the shipped pipeline's own border token", () => {
    expect(css).toContain(`border-color: ${swatch.borderStrong} !important`)
    expect(swatch.border).not.toBe(swatch.borderStrong)
  })

  it("forces border-width/border-style on affordance controls only, not on the broad erase rule", () => {
    // border-color stays on the broad erase rule; width/style live only on
    // BORDER_CONTAINER_SELECTOR (see the module header's lift section).
    const [eraseBlock] = css.match(
      /\*:not\(img\):not\(video\):not\(svg\):not\(canvas\):not\(\[data-my-ext\]\):not\(:where\(\[data-my-ext\] \*\)\) \{[^}]*\}/
    ) ?? [""]
    expect(eraseBlock).toContain(
      `border-color: ${swatch.borderStrong} !important`
    )
    expect(eraseBlock).not.toContain("border-width")
    expect(eraseBlock).not.toContain("border-style")
    expect(css).toContain("border-style: solid !important")
    expect(css).toContain("border-width: 1px !important")
  })

  it("scopes border-width/style to affordance controls — no forced borders on structural containers", () => {
    // Structural containers get the lift instead (tests below).
    const [borderWidthBlock] = css.match(
      /[^\n]*\{\s*border-style: solid[^}]*\}/
    ) ?? [""]
    for (const affordance of [
      "input",
      "textarea",
      "select",
      "button",
      "dialog",
    ]) {
      expect(borderWidthBlock).toMatch(new RegExp(`\\b${affordance}\\b`))
    }
    for (const structural of ["div", "section", "nav", "table", "li", "td"]) {
      expect(borderWidthBlock).not.toMatch(new RegExp(`\\b${structural}\\b`))
    }
    for (const inline of ["span", "code", "kbd", "samp", "a"]) {
      expect(borderWidthBlock).not.toMatch(new RegExp(`\\b${inline}\\b`))
    }
  })

  it("lifts structural containers with a top-lit gradient instead of a forced border", () => {
    expect(css).toContain(swatch.lift)
    expect(css).toContain("linear-gradient(")
    for (const structural of ["div", "section", "nav", "table"]) {
      expect(liftBlock()).toMatch(new RegExp(`\\b${structural}\\b`))
    }
  })

  it("bounds the lift's raster cost to a fixed strip, independent of container height", () => {
    // Without background-size a gradient rasterizes the whole box (see the
    // module header).
    expect(liftBlock()).toContain("background-size: 100% 3rem")
    expect(liftBlock()).toContain("background-repeat: no-repeat")
    expect(liftBlock()).toContain("background-position: top")
  })

  it("never uses :has() — LIFT_SELECTOR is :not(:only-child), not a group-envelope :has()", () => {
    // Too costly to invalidate on a dense page (see the module header).
    expect(css).not.toContain(":has(")
  })

  it("never sets color-scheme (§3.4) — measured to pierce the shadow boundary in this build", () => {
    // See buildEnforcementCSS's doc comment.
    expect(css).not.toContain("color-scheme")
  })

  it("excludes this extension's own DOM by selector, never by a user-origin `all: revert` (which rolls back past the author origin and strips prepaint.css from the veil)", () => {
    expect(css).not.toContain("revert")
    // The erase rule carries the exclusion itself.
    expect(css).toContain(ERASE_RULE)
    // And so does every rule that could otherwise reach the veil (a <div>).
    const unguarded = css
      .split("\n")
      .filter((line) => /^[^\s/].*\{\s*$/.test(line))
      .filter((line) => !line.includes("data-my-ext"))
      .filter((line) => !line.startsWith(":root:root"))
      .filter((line) => !line.startsWith("::selection"))
    expect(unguarded).toEqual([])
  })

  it("erases generated content too — a vendor ::before/::after is its own paint surface", () => {
    const rule = ruleBody(`${GUARDED}::before`)
    expect(rule).toContain("::after")
    expect(rule).toContain("background-color: transparent !important;")
    expect(rule).toContain("background-image: none !important;")
    expect(rule).toContain(`color: ${swatch.text0} !important;`)
  })

  it("resets glyph fill and underline colour to currentColor on both erase rules, never a fixed token", () => {
    for (const body of [
      ruleBody(ERASE_RULE),
      ruleBody(`${GUARDED}::before`),
      ruleBody(TEXT_PSEUDO_RULE),
    ]) {
      expect(body).toContain(
        "-webkit-text-fill-color: currentColor !important;"
      )
      expect(body).toContain("text-decoration-color: currentColor !important;")
    }
    // A fixed token here would override every HIGHLIGHT_TABLE colour row.
    expect(css).not.toMatch(/-webkit-text-fill-color: (?!currentColor)/)
    expect(css).not.toMatch(/text-decoration-color: (?!currentColor)/)
  })

  it("erases the remaining painting pseudo-elements", () => {
    // A file input's button is painted like every other button (inputBg),
    // with the erase rule's channel resets.
    const file = ruleBody(
      ":where(input):not([data-my-ext]):not([data-my-ext] *)::file-selector-button {"
    )
    expect(file).toContain(`background-color: ${swatch.inputBg} !important;`)
    expect(file).toContain("background-image: none !important;")
    expect(file).toContain("box-shadow: none !important;")
    // Every channel the erase rule resets.
    expect(file).toContain(`outline-color: ${swatch.borderStrong} !important;`)
    expect(file).toContain("backdrop-filter: none !important;")
    // Text fragments: channels reset, colour inherited from the originating
    // element — text0 here would repaint the first line of every p (text1).
    const [textHead] = css.match(/^[^\n]*::first-line[^\n]*\{$/m) ?? [""]
    expect(textHead).toContain(`${TEXT_BLOCK}${GUARD}::first-letter`)
    expect(textHead).toContain(`${TEXT_BLOCK}${GUARD}::first-line`)
    expect(textHead).toContain(`:where(li, summary)${GUARD}::marker`)
    // Never on a universal subject: that makes the engine resolve these
    // pseudo-styles for every block (measured 117 ms -> 270 ms on a 36k-node
    // page; see ERASE_TEXT_PSEUDO_SELECTOR's header).
    for (const pseudo of ["::first-letter", "::first-line", "::marker"]) {
      expect(css).not.toContain(`${GUARDED}${pseudo}`)
    }
    const text = ruleBody(TEXT_PSEUDO_RULE)
    expect(text).toContain("color: inherit !important;")
    expect(text).not.toContain(swatch.text0)
    expect(text).toContain("background-color: transparent !important;")
    expect(text).toContain("background-image: none !important;")
    expect(text).toContain("text-shadow: none !important;")
  })

  it("excludes descendants of extension-owned elements without raising the erase rule's specificity", () => {
    // The descendant clause sits inside :where(), so the erase rule stays
    // at (0,1,4). A bare :not([data-my-ext] *) would make it (0,2,4) and
    // beat the canvas rule and every (0,2,0) highlight row.
    expect(ERASE_RULE).toContain(":not(:where([data-my-ext] *))")
    expect(
      ERASE_RULE.replace(":not(:where([data-my-ext] *))", "")
    ).not.toContain("[data-my-ext] *")
    // Every pseudo-element rule carries the full guard.
    for (const pseudo of ["::before", "::after", "::backdrop"]) {
      expect(css).toContain(`${GUARDED}${pseudo}`)
    }
    for (const pseudo of [
      "::first-letter",
      "::first-line",
      "::marker",
      "::file-selector-button",
      "::placeholder",
    ]) {
      expect(css).toContain(`${GUARD}${pseudo}`)
    }
    expect(css).not.toContain(":where(*:not([data-my-ext]))::")
  })

  it("interpolates the given swatch's own tokens, not another swatch's", () => {
    const purple = SWATCHES["purple-gray"]
    const purpleCss = buildEnforcementCSS(purple)
    expect(purpleCss).toContain(purple.bg0)
    expect(purpleCss).toContain(purple.text0)
    expect(purpleCss).toContain(purple.borderStrong)
    expect(purpleCss).not.toContain(swatch.bg0)
  })
})

describe("HIGHLIGHT_TABLE (ADR 0003 §3)", () => {
  it("ports theme-apply.ts's own text-tier/link/code rules, not invented ones", () => {
    expect(css).toContain(`:where(h1, h2, h3, h4, h5, h6)`)
    expect(css).toContain(`color: ${swatch.text0} !important;`)
    expect(css).toContain(
      `:where(p, span, label, caption, figcaption, blockquote, cite, li, dt, dd)`
    )
    expect(css).toContain(`color: ${swatch.text1} !important;`)
    expect(css).toContain(`:where(small, sub, sup, abbr, time)`)
    expect(css).toContain(`color: ${swatch.text2} !important;`)
    expect(css).toContain(`:where(a)`)
    expect(css).toContain(`color: ${swatch.link} !important;`)
    expect(css).toContain(`:where(a:visited)`)
    expect(css).toContain(`color: ${swatch.linkVisited} !important;`)
    expect(css).toContain(`:where(code, kbd, samp)`)
    expect(css).toContain(`color: ${swatch.codeFg} !important;`)
  })

  it("retains every original semantic-surface row unchanged", () => {
    expect(css).toContain("dialog, [popover]")
    expect(css).toContain(
      '[role="dialog"], [role="menu"], [role="listbox"], [role="tooltip"]'
    )
    expect(css).toContain("input, textarea, select, button")
    expect(css).toContain("th, thead")
    expect(css).toContain("nav, header, aside")
    expect(css).toContain(`background-color: ${swatch.surface} !important;`)
    expect(css).toContain(`background-color: ${swatch.inputBg} !important;`)
  })

  it("adds accent-color on native form controls (new — no existing-pipeline precedent)", () => {
    expect(css).toContain(`accent-color: ${swatch.link} !important;`)
  })

  it("ports the pseudo-element rules (::selection, ::placeholder) verbatim", () => {
    expect(css).toContain("::selection")
    expect(css).toContain(`background-color: ${swatch.selectionBg} !important;`)
    // Not verbatim: a pseudo-element inside :where() invalidates the whole
    // forgiving list — the pseudo-element sits outside.
    // And EXT_GUARD is on it: Chromium's placeholder is a UA-shadow element
    // the erase rule reaches (§8.1 crossing), so (0,0,1) alone loses to it.
    expect(css).toContain(
      ":where(input, textarea):not([data-my-ext]):not([data-my-ext] *)::placeholder {"
    )
    expect(css).not.toContain("::placeholder, ")
    expect(css).not.toContain("::placeholder)")
  })

  it("does NOT include the svg fill/stroke row — held back for ADR 0003 §3.1's own sign-off", () => {
    expect(css).not.toContain("svg *")
    expect(css).not.toContain("stroke:")
    expect(css).not.toContain("fill:")
  })

  it("every highlight-table rule beats ERASE_SELECTOR's (0,0,4) via EXT_GUARD, same as the original table", () => {
    // :where(...) zeroes the base selector, so every row is exactly
    // EXT_GUARD's (0,2,0) and can override the erase rule's `color: text0`.
    const guardOccurrences = css.match(
      /:not\(\[data-my-ext\]\):not\(\[data-my-ext\] \*\)/g
    )
    // A lower bound (12 rows today), so adding a row needs no edit here.
    expect(guardOccurrences?.length ?? 0).toBeGreaterThanOrEqual(12)
  })
})
