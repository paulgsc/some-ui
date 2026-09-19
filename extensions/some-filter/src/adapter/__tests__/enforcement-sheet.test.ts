import { buildEnforcementCSS } from "@filter/adapter/enforcement-sheet"
import { SWATCHES } from "@filter/adapter/swatches"
import { describe, expect, it } from "vitest"

const swatch = SWATCHES.default

describe("buildEnforcementCSS", () => {
  it("is pure — identical output for the same swatch", () => {
    expect(buildEnforcementCSS(swatch)).toBe(buildEnforcementCSS(swatch))
  })

  it("produces balanced braces (a malformed rule would starve every rule after it)", () => {
    const css = buildEnforcementCSS(swatch)
    const opens = (css.match(/{/g) ?? []).length
    const closes = (css.match(/}/g) ?? []).length
    expect(opens).toBe(closes)
    expect(opens).toBeGreaterThan(0)
  })

  it("boosts the canvas rule (§3.2) — :root:root, never a bare html/body", () => {
    const css = buildEnforcementCSS(swatch)
    expect(css).toContain(":root:root, :root:root body")
    expect(css).not.toMatch(/(?<!:root)\bhtml\s*,\s*body\b/)
  })

  it("erases without reading — the erase selector carries no swatch-specific token", () => {
    const css = buildEnforcementCSS(swatch)
    expect(css).toContain("*:not(img):not(video):not(svg):not(canvas)")
    expect(css).toContain("background-image: none !important")
  })

  it("uses borderStrong (ADR 0002 §2.3), not the shipped pipeline's own border token", () => {
    const css = buildEnforcementCSS(swatch)
    expect(css).toContain(`border-color: ${swatch.borderStrong} !important`)
    expect(swatch.border).not.toBe(swatch.borderStrong)
  })

  it("forces border-width/border-style on containers only, not on the broad erase rule", () => {
    // Regression lock for a live-measured gap: a real vendor element with
    // no border-width of its own left borderStrong's own correct
    // border-color rendering nothing at all. A first fix forced width/style
    // on every erased element and was itself found too visually noisy on a
    // dense real UI (boxed spans/badges/code) — see this module's own
    // header, "border-width is forced on containers only, not every erased
    // carrier". border-color must still be on the broad erase rule; width/
    // style must NOT be — they moved to BORDER_CONTAINER_SELECTOR.
    const css = buildEnforcementCSS(swatch)
    const [eraseBlock] = css.match(
      /\*:not\(img\):not\(video\):not\(svg\):not\(canvas\) \{[^}]*\}/
    ) ?? [""]
    expect(eraseBlock).toContain(
      `border-color: ${swatch.borderStrong} !important`
    )
    expect(eraseBlock).not.toContain("border-width")
    expect(eraseBlock).not.toContain("border-style")
    expect(css).toContain("border-style: solid !important")
    expect(css).toContain("border-width: 1px !important")
  })

  it("scopes border-width/style to container elements — no borders on inline text carriers", () => {
    // The exact live-measured regression: span/a/code/kbd/samp getting a
    // rendered border on a dense UI (every chip and badge boxed). Container
    // tags (div, section, table structure, landmark regions, form controls)
    // get the width/style rule; inline/text-level carriers must not appear
    // in that rule's own selector list.
    const css = buildEnforcementCSS(swatch)
    const [borderWidthBlock] = css.match(
      /[^\n]*\{\s*border-style: solid[^}]*\}/
    ) ?? [""]
    for (const container of [
      "div",
      "section",
      "nav",
      "table",
      "dialog",
      "input",
    ]) {
      expect(borderWidthBlock).toMatch(new RegExp(`\\b${container}\\b`))
    }
    for (const inline of ["span", "code", "kbd", "samp", "a"]) {
      expect(borderWidthBlock).not.toMatch(new RegExp(`\\b${inline}\\b`))
    }
  })

  it("never sets color-scheme (§3.4) — measured to pierce the shadow boundary in this build", () => {
    // Regression lock for buildEnforcementCSS's own header: an earlier
    // version of this sheet included `:root { color-scheme: dark }` per
    // §3.3, and the adr0002-enforcement-sheet.spec.ts §3.1 e2e case caught
    // it reproducing §3.4's shadow-piercing quirk for real — not a
    // hypothetical to avoid relying on, an active leak this build produces.
    const css = buildEnforcementCSS(swatch)
    expect(css).not.toContain("color-scheme")
  })

  it("excludes this extension's own DOM from every rule it writes", () => {
    const css = buildEnforcementCSS(swatch)
    expect(css).toContain("[data-my-ext]")
    expect(css).toContain("all: revert !important")
  })

  it("interpolates the given swatch's own tokens, not another swatch's", () => {
    const purple = SWATCHES["purple-gray"]
    const css = buildEnforcementCSS(purple)
    expect(css).toContain(purple.bg0)
    expect(css).toContain(purple.text0)
    expect(css).toContain(purple.borderStrong)
    expect(css).not.toContain(swatch.bg0)
  })
})

describe("HIGHLIGHT_TABLE (ADR 0003 §3)", () => {
  it("ports theme-apply.ts's own text-tier/link/code rules, not invented ones", () => {
    const css = buildEnforcementCSS(swatch)
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

  it("retains every original semantic-surface row (#1463) unchanged", () => {
    const css = buildEnforcementCSS(swatch)
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
    const css = buildEnforcementCSS(swatch)
    expect(css).toContain(`accent-color: ${swatch.link} !important;`)
  })

  it("ports the pseudo-element rules (::selection, ::placeholder) verbatim", () => {
    const css = buildEnforcementCSS(swatch)
    expect(css).toContain("::selection")
    expect(css).toContain(`background-color: ${swatch.selectionBg} !important;`)
    expect(css).toContain(":where(input::placeholder, textarea::placeholder)")
  })

  it("does NOT include the svg fill/stroke row — held back for ADR 0003 §3.1's own sign-off", () => {
    const css = buildEnforcementCSS(swatch)
    expect(css).not.toContain("svg *")
    expect(css).not.toContain("stroke:")
    expect(css).not.toContain("fill:")
  })

  it("every highlight-table rule beats ERASE_SELECTOR's (0,0,4) via EXT_GUARD, same as the original table", () => {
    // :where(...) zeroes the base selector's own specificity, so every row
    // still carries exactly EXT_GUARD's (0,2,0) regardless of how many
    // properties or how complex the selector list — this is what lets
    // `color`, not just `background-color`, safely override the erase
    // rule's own `color: text0`.
    const css = buildEnforcementCSS(swatch)
    const guardOccurrences = css.match(
      /:not\(\[data-my-ext\]\):not\(\[data-my-ext\] \*\)/g
    )
    // 12 rows in HIGHLIGHT_TABLE at time of writing; a strict lower bound
    // (not an exact count) so this doesn't need editing every time a row
    // is added, only if the guard mechanism itself regresses to zero.
    expect(guardOccurrences?.length ?? 0).toBeGreaterThanOrEqual(12)
  })
})
