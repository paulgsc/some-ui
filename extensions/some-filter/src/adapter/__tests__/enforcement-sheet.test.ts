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

  it("neutralizes a root-level vendor filter on the canvas rule (bot-found on #1463: html { filter: invert(1) } inverted E back to light)", () => {
    const css = buildEnforcementCSS(swatch)
    const start = css.indexOf(":root:root, :root:root body {")
    expect(start).toBeGreaterThan(-1)
    const rule = css.slice(start, css.indexOf("}", start))
    expect(rule).toContain("filter: none !important;")
  })

  it("erases inset box-shadows and descendant filters on every non-media element (bot-found on #1463, round 3)", () => {
    const css = buildEnforcementCSS(swatch)
    const eraseStart = css.indexOf(
      "*:not(img):not(video):not(svg):not(canvas):not([data-my-ext]) {"
    )
    expect(eraseStart).toBeGreaterThan(-1)
    const erase = css.slice(eraseStart, css.indexOf("}", eraseStart))
    expect(erase).toContain("box-shadow: none !important;")
    expect(erase).toContain("filter: none !important;")
    expect(erase).toContain("backdrop-filter: none !important;")
    const pseudoStart = css.indexOf(":where(*:not([data-my-ext]))::before")
    const pseudo = css.slice(pseudoStart, css.indexOf("}", pseudoStart))
    expect(pseudo).toContain("box-shadow: none !important;")
    expect(pseudo).toContain("filter: none !important;")
    expect(pseudo).toContain("backdrop-filter: none !important;")
  })

  it("erases text-shadows and imposes outline-color on both erase rules (bot-found on #1500, round 2)", () => {
    const css = buildEnforcementCSS(swatch)
    const eraseStart = css.indexOf(
      "*:not(img):not(video):not(svg):not(canvas):not([data-my-ext]) {"
    )
    const erase = css.slice(eraseStart, css.indexOf("}", eraseStart))
    expect(erase).toContain("text-shadow: none !important;")
    expect(erase).toContain(`outline-color: ${swatch.borderStrong} !important;`)
    // Colour only — width and style stay the vendor's, like border-color.
    expect(erase).not.toMatch(/outline-(width|style|offset)/)
    expect(erase).not.toMatch(/^\s*outline:/m)
    const pseudoStart = css.indexOf(":where(*:not([data-my-ext]))::before")
    const pseudo = css.slice(pseudoStart, css.indexOf("}", pseudoStart))
    expect(pseudo).toContain("text-shadow: none !important;")
    expect(pseudo).toContain(
      `outline-color: ${swatch.borderStrong} !important;`
    )
  })

  it("imposes a dark top-layer ::backdrop, excluding the veil's own (bot-found on #1463, round 3)", () => {
    const css = buildEnforcementCSS(swatch)
    const start = css.indexOf(":where(*:not([data-my-ext]))::backdrop {")
    expect(start).toBeGreaterThan(-1)
    const rule = css.slice(start, css.indexOf("}", start))
    expect(rule).toContain("background-color: rgba(0, 0, 0, 0.6) !important;")
    expect(rule).not.toContain("transparent")
    // The backdrop's own independent channels (bot-found, confirming review).
    expect(rule).toContain("box-shadow: none !important;")
    expect(rule).toContain("backdrop-filter: none !important;")
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

  it("forces border-width/border-style on affordance controls only, not on the broad erase rule", () => {
    // Regression lock for a live-measured gap: a real vendor element with
    // no border-width of its own left borderStrong's own correct
    // border-color rendering nothing at all. A first fix forced width/style
    // on every erased element and was itself found too visually noisy on a
    // dense real UI (boxed spans/badges/code); a second fix narrowed it to
    // every structural container and produced a border *soup* instead — see
    // this module's own header, "border soup: containers get a lift
    // gradient, not a forced border". border-color must still be on the
    // broad erase rule; width/style must NOT be — they now live only on
    // BORDER_CONTAINER_SELECTOR's narrow, affordance-only selector.
    const css = buildEnforcementCSS(swatch)
    const [eraseBlock] = css.match(
      /\*:not\(img\):not\(video\):not\(svg\):not\(canvas\):not\(\[data-my-ext\]\) \{[^}]*\}/
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
    // Structural containers (div, section, table structure, landmark
    // regions) no longer get a forced border at all — that was the border
    // soup this module's own header records. Only form controls and dialog
    // (real interactive affordance) still get one; those same containers
    // get the lift gradient instead (see the LIFT_SELECTOR tests below).
    const css = buildEnforcementCSS(swatch)
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
    const css = buildEnforcementCSS(swatch)
    expect(css).toContain(swatch.lift)
    expect(css).toContain("linear-gradient(")
    // Structural containers that got the border in the old scheme now
    // appear in the lift rule's own selector instead.
    const [liftBlock] = css.match(/:where\(:is\([^)]*\)[^{]*\{[^}]*\}/) ?? [""]
    for (const structural of ["div", "section", "nav", "table"]) {
      expect(liftBlock).toMatch(new RegExp(`\\b${structural}\\b`))
    }
  })

  it("bounds the lift's raster cost to a fixed strip, independent of container height", () => {
    // Regression lock for a live-measured hazard: a plain background-image
    // gradient with no background-size sizes itself to the element's full
    // box, not the visual 3rem fade — on GitHub's PR "Files changed" tab
    // (many CONTAINER-matched sibling boxes, one per changed file, each as
    // tall as that file's own diff), that meant a full-box-height gradient
    // raster on every repaint of every expanded file. background-size +
    // no-repeat + a fixed background-position bound the rasterized area to
    // 3rem regardless of the box's real height — see this module's own
    // header, "the lift's raster cost must not scale with container height".
    const css = buildEnforcementCSS(swatch)
    const [liftBlock] = css.match(/:where\(:is\([^)]*\)[^{]*\{[^}]*\}/) ?? [""]
    expect(liftBlock).toContain("background-size: 100% 3rem")
    expect(liftBlock).toContain("background-repeat: no-repeat")
    expect(liftBlock).toContain("background-position: top")
  })

  it("never uses :has() — LIFT_SELECTOR is :not(:only-child), not a group-envelope :has()", () => {
    // The rejected alternative this module's own header records: :has() on
    // a broad subject with a universal argument is too costly to invalidate
    // on a streaming or dense page.
    const css = buildEnforcementCSS(swatch)
    expect(css).not.toContain(":has(")
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

  it("excludes this extension's own DOM by selector, never by a user-origin `all: revert` (bot-found on #1463: at the user origin, revert rolls back past the author origin and strips prepaint.css from the veil)", () => {
    const css = buildEnforcementCSS(swatch)
    expect(css).not.toContain("revert")
    // The erase rule carries the exclusion itself.
    expect(css).toContain(
      "*:not(img):not(video):not(svg):not(canvas):not([data-my-ext]) {"
    )
    // And so does every rule that could otherwise reach the veil (a <div>).
    const unguarded = css
      .split("\n")
      .filter((line) => /^[^\s/].*\{\s*$/.test(line))
      .filter((line) => !line.includes("data-my-ext"))
      .filter((line) => !line.startsWith(":root:root"))
      .filter((line) => !line.startsWith("::selection"))
    expect(unguarded).toEqual([])
  })

  it("erases generated content too — a vendor ::before/::after is its own paint surface (bot-found on #1463)", () => {
    const css = buildEnforcementCSS(swatch)
    const start = css.indexOf(":where(*:not([data-my-ext]))::before")
    expect(start).toBeGreaterThan(-1)
    const rule = css.slice(start, css.indexOf("}", start))
    expect(rule).toContain("::after")
    expect(rule).toContain("background-color: transparent !important;")
    expect(rule).toContain("background-image: none !important;")
    expect(rule).toContain(`color: ${swatch.text0} !important;`)
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
    // Not verbatim: a pseudo-element inside :where() invalidates the whole
    // forgiving list (bot-found on #1500) — the pseudo-element sits outside.
    // And EXT_GUARD is on it: Chromium's placeholder is a UA-shadow element
    // the erase rule reaches (§8.1 crossing), so (0,0,1) alone loses to it.
    expect(css).toContain(
      ":where(input, textarea):not([data-my-ext]):not([data-my-ext] *)::placeholder {"
    )
    expect(css).not.toContain("::placeholder, ")
    expect(css).not.toContain("::placeholder)")
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
