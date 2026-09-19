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

  it("forces border-width/border-style on the erase rule, not just border-color", () => {
    // Regression lock for a live-measured gap: a real vendor element with
    // no border-width of its own left borderStrong's own correct
    // border-color rendering nothing at all. See this module's own header,
    // "border-width is forced, not just border-color".
    const css = buildEnforcementCSS(swatch)
    expect(css).toContain("border-style: solid !important")
    expect(css).toContain("border-width: 1px !important")
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
