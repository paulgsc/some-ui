/**
 * ADR 0002 §2 — the enforcement sheet: a static, extension-owned stylesheet
 * text, built once per swatch and injected by `background/background.ts` at
 * the CSS **user origin** (`chrome.scripting.insertCSS({ origin: "USER" })`),
 * whose `!important` declarations outrank every author-origin declaration
 * regardless of the vendor's specificity or `!important` use (§2.1). Never
 * reads page state — no `getComputedStyle`, no DOM reference in this file —
 * which is the architectural point (§1.4): an unconditional "every page
 * renders in E" in place of classify-then-apply.
 *
 * §7 step 2, behind a flag: `background/background.ts` is the only consumer,
 * gated on `enforcementSheetEnabled` in `storage.local` (default `false`).
 * With the flag on, auto mode is this sheet alone, requested per document and
 * confirmed by a cascade read before the veil is released
 * (`lib/content/enforcement-handshake.ts`; §4).
 *
 * Every rule is guarded against this extension's own DOM (the prepaint veil,
 * the debug overlay — both carry `[data-my-ext]`, per `EXT_GUARD`): an
 * unguarded erase rule would blank the veil's opaque cover, and the
 * `[popover]` highlight row would repaint it.
 *
 * ── Shadow crossing (ADR 0002 §3.1 did not replicate) ─────────────────────
 *
 * §3.1 measured that a user-origin `!important` rule does not cross a shadow
 * boundary. Measured here (`tests/e2e/specs/adr0002-enforcement-sheet.spec.ts`,
 * Chromium 1194) and confirmed live on github.com: a sheet injected via
 * `insertCSS({ origin: "USER" })` DOES reach inside an open shadow root and
 * override an inline author style, so the erase rule overrides
 * shadow-scope-theming's per-scope realization. ADR 0003
 * (`docs/adr/0003-embrace-shadow-crossing-and-highlight-table.md`) accepts
 * crossing as the mechanism, conditional on that e2e canary staying in the
 * suite, and adds the §3 highlight table (`HIGHLIGHT_TABLE`) — all but its
 * §3.1 `svg *` row, held back for its own sign-off. Whether the crossing is
 * Chromium-specific is still open: Firefox honours the user origin (manual
 * check, no shadow roots on that page).
 *
 * ── Containers get a lift gradient, not a forced border ───────────────────
 *
 * A border colour with no vendor width paints nothing, so §2.3's "borders
 * carry hierarchy" needs a width (§5.4's div-soup risk). Forcing width on
 * every erased element boxed every chip and code span; forcing it on every
 * container drew boxes around everything. Instead, a translucent,
 * fixed-height, top-lit gradient (a "lift") goes on `LIFT_SELECTOR` — every
 * structural container *that has at least one sibling*:
 *
 *   - Siblings are separate concerns. `:not(:only-child)` marks each concern
 *     where the tree branches, without reading layout or vendor styling.
 *   - Wrapper chains collapse: single-child wrappers match nothing.
 *   - It composes: translucent layers over the canvas, a `bg1` surface, or a
 *     parent's lift — brightness steps at the edges become the cue.
 *   - Fixed height: a tall `main` and a small card get the same visible edge.
 *
 * Raster cost must not scale with container height: a gradient with no
 * `background-size` sizes itself to the whole box (colour stops only place
 * colours), and pages like a PR diff have many tall sibling containers.
 * `background-size: 100% 3rem` + `no-repeat` + `top` bounds the raster to an
 * O(1) strip per container with the same visual result.
 *
 * Rejected: `:has(> * ~ *)` (costly tree-wide invalidation, see
 * `LIFT_SELECTOR`); a depth ladder (counts nesting, not concerns); reading
 * vendor styles ("never read the vendor theme"); JS role tagging
 * (main-thread work that re-triggers invalidation); container queries (force
 * `container-type`, altering layout); an opaque gradient (identical nested
 * fills); a translucent full fill (compounds as `1 − (1 − α)ⁿ` toward white).
 *
 * Borders remain only on `BORDER_CONTAINER_SELECTOR` (form controls and
 * `dialog`, where a border is affordance). Inline carriers keep
 * `border-color` only, from `ERASE_SELECTOR`: visible only where the vendor
 * declared a width.
 */

import { EXT_GUARD } from "@filter/lib/content/theme-apply"

import type { Swatch } from "./swatches"

/**
 * §3.2: the erase rule (`ERASE_SELECTOR`) has specificity (0,1,4), which
 * would outrank a bare `html, body` canvas rule and leave the page on the
 * UA's white default with E's light text (measured). `:root:root` is (0,2,0)
 * on `html`, `:root:root body` (0,2,1) on `body`; (0,2,*) always outranks the
 * erase rule.
 */
const CANVAS_SELECTOR = ":root:root, :root:root body"

/**
 * A custom property only this sheet declares, carrying the swatch id; the
 * content side reads it back from `<html>` as proof the sheet is in the
 * cascade. Not the canvas colour: a vendor can paint its own `<html>` exactly
 * `bg0`. At the user origin, `!important` beats every author declaration of
 * the same name, so a page cannot fake it either.
 */
export const ENFORCEMENT_SENTINEL_PROPERTY = "--sw-enforcement-sheet"

/**
 * §2.2 (erase, don't paint): every carrier except media (`img`/`video`/
 * `svg`/`canvas`, which carry content meant to be read), plus the
 * `[data-my-ext]` exclusion. Exclusion must be by selector: a separate
 * `[data-my-ext] { all: revert }` at the user origin rolls back to the UA
 * origin, stripping `prepaint.css`'s author styling from the veil.
 * Descendants of an extension-owned element are excluded too, the same
 * contract as `EXT_GUARD`.
 *
 * Specificity (0,1,4), deliberately below `CANVAS_SELECTOR` and every
 * `:where(...)${EXT_GUARD}` row's (0,2,0). Hence `:not(:where([data-my-ext] *))`
 * rather than `EXT_GUARD`'s bare `:not([data-my-ext] *)`, which would add
 * (0,1,0) and beat the rules this sits under.
 */
const ERASE_SELECTOR =
  "*:not(img):not(video):not(svg):not(canvas):not([data-my-ext]):not(:where([data-my-ext] *))"

/**
 * Same erase policy for generated content: `*` never matches a
 * pseudo-element, so vendor `::before`/`::after` boxes (a white overlay, a
 * light card fill) would otherwise paint over the erased canvas.
 * Specificity (0,0,1); user-origin `!important` wins regardless. `EXT_GUARD`
 * inside `:where()` excludes extension-owned pseudo-elements at no
 * specificity cost.
 */
const ERASE_PSEUDO_SELECTOR = ["::before", "::after"]
  .map((pseudo) => `:where(*${EXT_GUARD})${pseudo}`)
  .join(", ")

/**
 * A file input's button is painted like every other button (`inputBg`), not
 * erased. Chromium implements `::file-selector-button` as an
 * `<input type="button">` in the UA shadow tree, which the input/button
 * highlight row already reaches (§8.1 crossing); naming the same token here
 * makes engines with a real pseudo-element agree. A pseudo-element cannot sit
 * inside `:where()`, hence `:where(input)` + `EXT_GUARD` before it.
 */
const FILE_BUTTON_SELECTOR = `:where(input)${EXT_GUARD}::file-selector-button`

/**
 * `::first-letter`, `::first-line` and `::marker` paint a fragment of their
 * originating element's text, so they get the erase resets with
 * `color: inherit`: a hard-coded `text0` would repaint the first line of
 * every `p` (`text1`) and every `li` bullet in a different colour from the
 * text beside it. `::marker` ignores everything here but `color`. (0,0,1).
 *
 * Tag-constrained, not `*`: a universal rule makes the engine resolve these
 * pseudo-styles for every block. Measured on a 36k-element fixture: the
 * universal rule took the initial style pass from 117 ms to 270 ms; these
 * subjects measured within noise of no rule. The trade: a vendor
 * `::first-line` on an element outside `TEXT_BLOCK`, or a `display: list-item`
 * marker, keeps its authored colour.
 */
const TEXT_BLOCK =
  "p, h1, h2, h3, h4, h5, h6, li, blockquote, dd, dt, figcaption, caption"
const ERASE_TEXT_PSEUDO_SELECTOR = [
  `:where(${TEXT_BLOCK})${EXT_GUARD}::first-letter`,
  `:where(${TEXT_BLOCK})${EXT_GUARD}::first-line`,
  `:where(li, summary)${EXT_GUARD}::marker`,
].join(", ")

/**
 * Structural containers eligible for the lift (see the header). Excluded:
 * form controls (own affordance), `td`/`tr` (would stripe every row),
 * `code`/`kbd`/`samp`/`pre` (own fill), and `li` (untested for noise on long
 * lists).
 */
const CONTAINER =
  "div, section, article, aside, nav, header, footer, main, ul, ol, table, form, fieldset, figure, details"

/**
 * `:not(:only-child)`: the tree branches here. Not `:has(> * ~ *)`: `:has()`
 * invalidates on every mutation within its argument's reach, which with a
 * broad subject and universal argument is tree-wide on every child mutation.
 * `:only-child` invalidation is sibling-local.
 */
const LIFT_SELECTOR = `:is(${CONTAINER}):not(:only-child)`

/**
 * Borders only where they are affordance, not structure (see the header).
 * No specificity boost needed: nothing else sets `border-width`/`border-style`.
 */
const BORDER_CONTAINER_SELECTOR = "input, textarea, select, button, dialog"

/**
 * ADR 0003 §3 — the compile-time highlight table: an IDE highlighter's
 * token-to-colour grammar, not a page-reading classifier. It replaces the
 * erase rule's flat `color: text0` on content (the §5.4 div-soup risk).
 *
 * Text-tier/link/code rows are ported from `theme-apply.ts`'s
 * `DARK_THEME_BODY_RULES`, so a page themed by both layers shows one opinion
 * per element. `accent-color` and the `nav`/`header`/`aside` → `bg1`
 * placement have no ported precedent; ADR 0002 §7 step 4 checks those live.
 * ADR 0003 §3.1's `svg *` fill/stroke row is excluded (a new cost that
 * flattens multi-colour icons; the ADR asks to see it live first).
 *
 * Each selector is wrapped in `:where()` so every row is exactly
 * `EXT_GUARD`'s (0,2,0), past the erase rule, matching `theme-apply.ts`'s
 * idiom. `declarations` returns raw CSS since some rows set several properties.
 */
const HIGHLIGHT_TABLE: ReadonlyArray<{
  readonly selector: string
  readonly declarations: (swatch: Swatch) => string
}> = [
  // Text tiers — ported from DARK_THEME_BODY_RULES.
  {
    selector: "h1, h2, h3, h4, h5, h6",
    declarations: (s) => `color: ${s.text0} !important;`,
  },
  {
    selector:
      "p, span, label, caption, figcaption, blockquote, cite, li, dt, dd",
    declarations: (s) => `color: ${s.text1} !important;`,
  },
  {
    selector: "small, sub, sup, abbr, time",
    declarations: (s) => `color: ${s.text2} !important;`,
  },
  { selector: "a", declarations: (s) => `color: ${s.link} !important;` },
  {
    selector: "a:visited",
    declarations: (s) => `color: ${s.linkVisited} !important;`,
  },
  {
    selector: "code, kbd, samp",
    declarations: (s) =>
      `background-color: ${s.bg3} !important; color: ${s.codeFg} !important;`,
  },
  {
    selector: "pre",
    declarations: (s) =>
      `background-color: ${s.bg2} !important; color: ${s.text0} !important;`,
  },

  // Semantic surfaces.
  {
    selector: "dialog, [popover]",
    declarations: (s) => `background-color: ${s.surface} !important;`,
  },
  {
    selector:
      '[role="dialog"], [role="menu"], [role="listbox"], [role="tooltip"]',
    declarations: (s) => `background-color: ${s.surface} !important;`,
  },
  {
    selector: "input, textarea, select, button",
    declarations: (s) => `background-color: ${s.inputBg} !important;`,
  },
  {
    selector: "th, thead",
    declarations: (s) => `background-color: ${s.bg2} !important;`,
  },
  {
    selector: "nav, header, aside",
    declarations: (s) => `background-color: ${s.bg1} !important;`,
  },

  // ADR 0003 §3, no ported precedent: accent-color is the compile-time-only
  // property for native checkbox/radio/range controls.
  {
    selector: "input, textarea, select",
    declarations: (s) => `accent-color: ${s.link} !important;`,
  },
]

/**
 * Builds the enforcement sheet's full CSS text for `swatch` — pure, no DOM,
 * no randomness; byte-identical across calls.
 *
 * Implements ADR 0002 §2.2 (erase) + §2.3 (hierarchy: `borderStrong` on
 * affordance controls, `lift` on structural containers) + §3.2 (canvas
 * boost) + §3.5 (`background-image: none`, the accepted fidelity cost) + ADR
 * 0003 §3 (`HIGHLIGHT_TABLE`) + the `[data-my-ext]` exclusion.
 *
 * Deliberately omits `color-scheme: dark` (§3.3/§3.4): measured in the
 * adr0002 e2e spec, adding it reproduces the §3.4 shadow-piercing quirk (an
 * open shadow root's styled child turned `rgba(0, 0, 0, 0)`). §3.3's
 * UA-canvas/native-control fallback is follow-up work.
 */
export function buildEnforcementCSS(swatch: Swatch): string {
  const highlightRules = HIGHLIGHT_TABLE.map(
    ({ selector, declarations }) =>
      `:where(${selector})${EXT_GUARD} { ${declarations(swatch)} }`
  ).join("\n")

  return `
/* ── ADR 0002 enforcement sheet (user origin) — swatch: ${swatch.id} ─────── */

/* §3.2: specificity-boosted canvas rule — must out-rank ERASE_SELECTOR. */
${CANVAS_SELECTOR} {
  background-color: ${swatch.bg0} !important;
  /* The presence sentinel — see ENFORCEMENT_SENTINEL_PROPERTY. */
  ${ENFORCEMENT_SENTINEL_PROPERTY}: ${swatch.id} !important;
  /* A vendor's own root-level compositing filter (the "dark mode via an
     invert(1) filter on html" trick, filter-invert-vendor-page.html) is
     applied *after* painting and would invert every enforced token back to
     light — E only holds if the canvas paints unfiltered (bot-found on
     #1463, Codex round 2). Neutralized on html/body only, the two roots a
     page-wide filter is put on; a filter on a descendant is that element's
     own paint, same as any other vendor colour decision, and is erased by
     the rule below only insofar as its inputs are. Note this also
     overrides this extension's *own* legacy invert (an author-origin
     !important filter on html) whenever both are active in one tab — which
     is why, since #1489, the sheet is only ever present in an auto tab: the
     content side removes it, under the veil, before legacy's filter goes
     on. */
  filter: none !important;
}

/* §2.2/§2.3/§3.5: erase every vendor surface; let the canvas show through.
   Extension-owned elements are excluded by the selector itself — see
   ERASE_SELECTOR's own header for why a separate user-origin reset rule
   was the wrong tool. border-color alone, never border-width/border-style
   here — see BORDER_CONTAINER_SELECTOR's own header for the narrow,
   affordance-only selector those two now live on, and LIFT_SELECTOR's own
   header for what replaced them on structural containers. */
${ERASE_SELECTOR} {
  background-color: transparent !important;
  background-image: none !important;
  color: ${swatch.text0} !important;
  border-color: ${swatch.borderStrong} !important;
  /* Two more paint channels the four declarations above do not reach
     (bot-found on #1463, Codex round 3). An inset shadow is a fill —
     box-shadow: inset 0 0 0 9999px white is the paint grammar's own
     PG-BG-INSET-SHADOW — and a compositing filter on any descendant group
     (main, #app) post-processes every enforced token inside it, the same
     way a root filter does on the canvas rule above. Both are erased on the
     same subject as colour: every non-media element. Vendor elevation
     shadows and descendant blur/drop-shadow effects go with them, which is
     the same class of accepted trade as background-image: none (ADR 0002
     §3.5). Media keep their filters via the img/video/svg/canvas
     exclusions on ERASE_SELECTOR. */
  box-shadow: none !important;
  filter: none !important;
  /* backdrop-filter post-processes whatever paints *behind* the element —
     a full-viewport overlay with backdrop-filter: invert(1) inverts the
     enforced canvas underneath it without painting anything itself
     (bot-found on #1463, Codex confirming review). Same subject, same
     trade as filter above. */
  backdrop-filter: none !important;
  /* Two more independent glyph/edge channels (bot-found on #1500, Codex
     round 2). A text-shadow is painted separately from color — a vendor's
     text-shadow: 0 0 0 white keeps every glyph white (or haloed) under an
     enforced color, so it is erased. An outline is painted separately from
     border — outline: 2px solid white stays white under an enforced
     border-color — so only its colour is imposed, the same way border-color
     is: width and style stay the vendor's, so focus rings keep their shape.
     theme-apply.ts's static sheet already enforces outline-color. */
  text-shadow: none !important;
  outline-color: ${swatch.borderStrong} !important;
  /* Two glyph channels that paint independently of color (#1497). An
     authored -webkit-text-fill-color fills glyphs whatever color says, and
     an authored text-decoration-color paints the underline on its own —
     black text or a white underline on the dark canvas either way.
     currentColor, never text0: both then follow the color the element ends
     up with, so a HIGHLIGHT_TABLE row (links, code, headings) keeps driving
     them instead of being silently overridden. It is also what keeps an
     excluded [data-my-ext] subtree safe: -webkit-text-fill-color inherits,
     and currentColor inherits as the keyword (CSS Color 4), so a guarded
     child's glyphs resolve against its own colour, not the enforced colour
     of an ancestor outside the guard. A fixed token here would leak into
     every guarded subtree; the #1497 e2e case reads the child's fill back. */
  -webkit-text-fill-color: currentColor !important;
  text-decoration-color: currentColor !important;
}

/* Generated content is its own paint surface — see ERASE_PSEUDO_SELECTOR. */
${ERASE_PSEUDO_SELECTOR} {
  background-color: transparent !important;
  background-image: none !important;
  color: ${swatch.text0} !important;
  border-color: ${swatch.borderStrong} !important;
  box-shadow: none !important;
  filter: none !important;
  backdrop-filter: none !important;
  text-shadow: none !important;
  outline-color: ${swatch.borderStrong} !important;
  -webkit-text-fill-color: currentColor !important;
  text-decoration-color: currentColor !important;
}

/* Painted like a button, not erased — see FILE_BUTTON_SELECTOR. */
${FILE_BUTTON_SELECTOR} {
  background-color: ${swatch.inputBg} !important;
  background-image: none !important;
  color: ${swatch.text0} !important;
  border-color: ${swatch.borderStrong} !important;
  box-shadow: none !important;
  filter: none !important;
  backdrop-filter: none !important;
  text-shadow: none !important;
  outline-color: ${swatch.borderStrong} !important;
  -webkit-text-fill-color: currentColor !important;
  text-decoration-color: currentColor !important;
}

/* Text fragments inherit their originating element's enforced colour — see
   ERASE_TEXT_PSEUDO_SELECTOR. */
${ERASE_TEXT_PSEUDO_SELECTOR} {
  background-color: transparent !important;
  background-image: none !important;
  color: inherit !important;
  border-color: ${swatch.borderStrong} !important;
  box-shadow: none !important;
  text-shadow: none !important;
  -webkit-text-fill-color: currentColor !important;
  text-decoration-color: currentColor !important;
}

/* A top-layer backdrop is generated content too, but a transparent one
   would drop the dimming a modal relies on for focus — so it is imposed
   dark rather than erased (bot-found on #1463, Codex round 3: a vendor
   dialog::backdrop or popover backdrop painted white covers the whole
   viewport regardless of the dialog's own enforced surface). The
   [data-my-ext] exclusion matters here more than anywhere: the prepaint
   veil is a popover and prepaint.css styles its own ::backdrop. */
:where(*${EXT_GUARD})::backdrop {
  background-color: rgba(0, 0, 0, 0.6) !important;
  background-image: none !important;
  /* The same independent channels the erase rules reset: an inset shadow
     is a fill, and backdrop-filter re-composites the whole page beneath a
     viewport-sized backdrop (bot-found on #1463, Codex confirming review). */
  box-shadow: none !important;
  filter: none !important;
  backdrop-filter: none !important;
}

/* See BORDER_CONTAINER_SELECTOR's own header — form-control affordance
   only; inline/text-level carriers keep border-color only, above.
   EXT_GUARD for the same reason as every other row: the veil is a <div>. */
:where(${BORDER_CONTAINER_SELECTOR})${EXT_GUARD} {
  border-style: solid !important;
  border-width: 1px !important;
}

/* Lift: separation of UI concerns. Must out-rank ERASE_SELECTOR's (0,0,4)
   background-image: none, hence the :where() + EXT_GUARD (0,2,0) idiom —
   see this module's own header and LIFT_SELECTOR's own header.

   background-size/repeat/position bound the gradient's own raster cost to a
   fixed 3rem-tall strip, independent of the container's actual height — see
   this module's own header, "the lift's raster cost must not scale with
   container height". Without an explicit background-size, a CSS gradient's
   natural size is the *entire* background positioning area: the color-stop
   lengths below only decide where each color sits along that area, they do
   not bound how much of the box the browser has to rasterize. A container
   many thousands of pixels tall (a large expanded diff, a long thread) would
   otherwise cost the same to raster as a 3rem-tall one, not the fixed cost
   the visual design (and LIFT_SELECTOR's own performance argument) assumes. */
:where(${LIFT_SELECTOR})${EXT_GUARD} {
  background-image: linear-gradient(
    to bottom,
    ${swatch.lift},
    transparent
  ) !important;
  background-size: 100% 3rem !important;
  background-repeat: no-repeat !important;
  background-position: top !important;
}

/* ADR 0003 §3: the compile-time highlight table — text tiers, links, code,
   semantic-surface elevation, and native form-control accent color. */
${highlightRules}

/* ::selection is a real pseudo-element, so the universal selector "*" of
   ERASE_SELECTOR never matches it and its (0,0,1) needs no boost. Ported
   verbatim from theme-apply.ts's own DARK_THEME_BODY_RULES.

   The placeholder rule is NOT the verbatim port, twice over. (1) theme-apply.ts
   nests the two pseudo-elements inside its :where() list, and a pseudo-element
   is not a valid member of a :where() list — the forgiving list drops both,
   :where() is left empty and matches nothing, so that rule has never applied
   (bot-found on #1500, Codex; the shipped copy is #1501). Here the
   pseudo-element is appended after the :where(). (2) Chromium implements
   ::placeholder as a real element inside the control's UA shadow tree, and
   §8.1 already recorded that this user-origin sheet crosses shadow
   boundaries: ERASE_SELECTOR's (0,1,4) "color: text0 !important" reaches
   that element and outranks a bare (0,0,1) placeholder rule (live-measured
   on #1500's e2e: the placeholder read back text0, not text2). EXT_GUARD's
   (0,2,0) lifts it above the erase rule. */
::selection {
  background-color: ${swatch.selectionBg} !important;
}
:where(input, textarea)${EXT_GUARD}::placeholder {
  color: ${swatch.text2} !important;
}
`
}
