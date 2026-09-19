/**
 * ADR 0002 §2 — the enforcement sheet: a static, extension-owned stylesheet
 * text, built once per swatch and injected by `background/background.ts` at
 * the CSS **user origin** (`chrome.scripting.insertCSS({ origin: "USER" })`),
 * whose `!important` declarations outrank every author-origin declaration
 * regardless of the vendor's own specificity or `!important` use (§2.1).
 * Never reads page state — no `getComputedStyle`, no DOM reference anywhere
 * in this file — which is the architectural point (§1.4): this replaces the
 * classify-then-apply pipeline's conditional "does this page need theming?"
 * with an unconditional "every page renders in E."
 *
 * §7 step 2, behind a flag, alongside the existing pipeline: this module has
 * no caller in the shipped content-script path (`adapter/pipeline.ts`,
 * `lib/content/theme-apply.ts`) and changes no existing behavior by
 * existing. `background/background.ts` is its only consumer, gated on
 * `enforcementSheetEnabled` in `storage.local` (default `false` — see that
 * module's own header for how to flip it). It does not replace, and is not
 * yet raced against, the veil (§4: "the veil is retained ... only the
 * commit/release decision simplifies").
 *
 * Every declaration below is guarded against this extension's own DOM (the
 * prepaint veil, the debug overlay — both carry `[data-my-ext]`, per
 * `theme-apply.ts`'s own `EXT_GUARD`) precisely because this sheet is meant
 * to run *alongside* that machinery during the flagged rollout, not instead
 * of it: an unguarded erase rule would blank the veil's own opaque cover
 * (and, since the veil carries `popover="manual"`, would also be
 * re-painted by the `[popover]` semantic-surface rule below with the wrong
 * color) the moment both are active in the same tab.
 *
 * ── Open, blocking finding: ADR 0002 §3.1 did not replicate here ──────────
 *
 * §3.1 measured that a user-origin `!important` rule does not cross a
 * shadow boundary, and §5.2 relies on that to retain the entire shadow
 * stack untouched. `tests/e2e/specs/adr0002-enforcement-sheet.spec.ts`'s own
 * §3.1 case — the direct regression test for that claim, run against
 * Chromium 1194, the same revision the ADR itself measured against — found
 * the opposite: a rule injected via the real MV3 extension surface,
 * `chrome.scripting.insertCSS({ origin: "USER" })`, from a real background
 * service worker, DOES reach inside an open shadow root and override an
 * explicit inline author-origin style there. Reproduced with the full erase
 * rule and, isolated further, with a single trivial `div { background-color:
 * ... !important }` rule and no other CSS in the sheet at all — this is not
 * an interaction with anything else this file adds (`color-scheme` was
 * already ruled out and removed for a related but distinct reason, above in
 * this diff's history).
 *
 * This module still builds the sheet exactly as ADR 0002 §2 describes — the
 * point of this step is to test the mechanism live, and this divergence
 * *is* one of the things that testing is for. But it means the "shadow
 * stack needs no changes" premise this file was written against does not
 * hold as measured: this sheet's erase rule would presently override the
 * existing shadow-scope-theming pipeline's own per-scope realization
 * (`adapter/shadow-scope-theming.ts`, `adapter/shadow-actuator.ts`) for any
 * page with a shadow-hosted vendor component, rather than leaving it
 * untouched. Before this goes any further than "behind a flag, alongside
 * the existing pipeline for live comparison" — in particular before ADR
 * 0002 §7 step 3 (Firefox parity) or step 5 (deleting the old pipeline,
 * irreversible) — this needs its own investigation: whether `insertCSS`'s
 * `origin: "USER"` is actually taking effect as true user-origin CSS in
 * this Chromium build/version, or whether user-origin genuinely does cross
 * shadow boundaries for an extension-injected sheet specifically (as
 * opposed to whatever mechanism the ADR's own §3.1 measurement used).
 *
 * Partial update: the user manually loaded a real `build:firefox` build in
 * live Firefox and reported the canvas rule, the erase rule's `color`, and
 * `borderStrong`'s own `border-color` all landing correctly on a real page —
 * the first evidence either way on ADR 0002 §6's own open question (does
 * Firefox honor `browser.scripting.insertCSS({ origin: "USER" })` at all).
 * That page had no open shadow roots, so it says nothing about whether this
 * §3.1 divergence is Chromium-specific or general — still open. Manual,
 * not an automated e2e result (this sandbox has no Firefox binary — see
 * `CLAUDE.md`) — recorded here as a data point, not a verification.
 *
 * ── border-width is forced, not just border-color ──────────────────────────
 *
 * A live probe against real GitHub markup (a `.Box`-classed div) found
 * `borderStrong`'s own `border-color` applying exactly as built, but
 * `border-width: 0px` — the vendor element declared no border of its own, so
 * nothing rendered despite the correct color. ADR 0002 §2.3 argues borders
 * carry hierarchy on a generic `<div>` tree precisely because backgrounds
 * have collapsed to `bg0`; a color with no width to paint through is the
 * same as no border at all for that argument, and §5.4 already names this
 * risk ("flat hierarchy on div soup ... unmeasured against the user's real
 * sites") — this was that measurement.
 *
 * `border-style: solid` + `border-width: 1px` are therefore forced on the
 * same broad `ERASE_SELECTOR`, same as `background-color`/`color` above —
 * not scoped to `SEMANTIC_SURFACES` or to block-level elements only. This is
 * the most direct fix for the specific gap just measured, and the bluntest:
 * it puts a hairline border on every erased element, `<span>`/`<a>`/`<code>`
 * included, which was not itself measured before shipping. If live testing
 * finds that too visually noisy, the next-cheapest dial is narrowing this to
 * block-level/structural selectors rather than every erased carrier — not
 * reverting to color-only, which is what produced the invisible-border
 * result in the first place.
 */

import { EXT_GUARD } from "@filter/lib/content/theme-apply"

import type { Swatch } from "./swatches"

/**
 * §3.2: the erase rule below (`ERASE_SELECTOR`) has specificity (0,0,4) —
 * `:not()` takes the specificity of its argument, and it chains four type
 * selectors — which outranks a bare `html, body` canvas rule at (0,0,1) and
 * blanks the canvas too: the page renders on the UA's own white default
 * with E's light text on it, the exact light-on-light failure this sheet
 * exists to prevent. Measured directly: `html`/`body` read back as
 * `rgba(0, 0, 0, 0)` under the unboosted selector, the correct swatch color
 * under this one.
 *
 * `:root:root` chains two pseudo-classes for specificity (0,2,0) on `html`
 * itself, and `:root:root body` — (0,2,1) — extends the same boost to
 * `body`, a descendant of `html` the plain `:root:root` selector does not
 * itself match. (0,2,*) always outranks (0,0,4): the second tuple component
 * (class/attribute/pseudo-class count) dominates the third (type count)
 * regardless of how many `:not()` clauses the erase rule chains.
 */
const CANVAS_SELECTOR = ":root:root, :root:root body"

/**
 * §2.2 (erase, don't paint): every carrier except the four excluded from
 * `background-image: none` below. `svg` is excluded alongside
 * `img`/`video`/`canvas` because it can carry its own fill/gradient defs
 * meant to be read, not erased — the same class of carrier as the other
 * three, not itself a background-color surface this rule needs to flatten.
 *
 * Verbatim from ADR 0002 §2.2's own measured snippet — kept textually
 * unmodified (no `EXT_GUARD`, no other addition) so its specificity stays
 * exactly (0,0,4), which is what `CANVAS_SELECTOR` above and the
 * `[data-my-ext]` exclusion below are each independently calibrated
 * against. Extension-owned elements are protected by that separate,
 * dedicated exclusion instead of by threading a guard through this
 * selector, specifically to avoid perturbing this specificity relationship.
 */
const ERASE_SELECTOR = "*:not(img):not(video):not(svg):not(canvas)"

/**
 * §2.3's named semantic-surface vocabulary — the only vocabulary available
 * without reading the page (§2.3's own argument: structural role, never a
 * vendor's own class/id names). Tier choices mirror `theme-apply.ts`'s own
 * `DARK_THEME_BODY_RULES` (`dialog`/`[popover]` → `surface`,
 * `input`/`textarea`/`select` → `inputBg`, `th` → `bg2`) so a page themed by
 * both layers at once — the flagged state this step ships in — does not
 * show two disagreeing opinions about the same element's elevation.
 * `button` and `nav`/`header`/`aside` have no existing-pipeline precedent to
 * match: `button` joins the input group (§2.3's own listing groups it
 * there), and `nav`/`header`/`aside` get the lowest fill tier (`bg1`) as the
 * smallest available elevation step for a landmark region over an otherwise
 * flattened `bg0` canvas — a placement choice, not a measured one; ADR 0002
 * §7 step 4's eye-strain validation is where that gets checked against a
 * real page rather than argued from here.
 *
 * Each selector is wrapped in `:where()` (zero specificity of its own) so
 * every entry's specificity is exactly `EXT_GUARD`'s (0,2,0) regardless of
 * how complex the base selector is — comfortably past the erase rule's
 * (0,0,4) — and to match `theme-apply.ts`'s own `:where(...)${EXT_GUARD}`
 * idiom for the identical reason it's used there.
 */
const SEMANTIC_SURFACES: ReadonlyArray<{
  readonly selector: string
  readonly tier: (swatch: Swatch) => string
}> = [
  { selector: "dialog, [popover]", tier: (s) => s.surface },
  {
    selector:
      '[role="dialog"], [role="menu"], [role="listbox"], [role="tooltip"]',
    tier: (s) => s.surface,
  },
  { selector: "input, textarea, select, button", tier: (s) => s.inputBg },
  { selector: "th, thead", tier: (s) => s.bg2 },
  { selector: "nav, header, aside", tier: (s) => s.bg1 },
]

/**
 * Builds the enforcement sheet's full CSS text for `swatch` — pure, no DOM,
 * no randomness. Two calls with the same `swatch` produce byte-identical
 * output.
 *
 * Implements ADR 0002 §2.2 (erase, don't paint) + §2.3 (border-led
 * hierarchy via `swatch.borderStrong`, the token `adapter/swatches/index.ts`
 * adds for exactly this) + §3.2 (the canvas specificity boost) + §3.5
 * (`background-image: none`, the required, blunt fidelity cost) + the
 * `[data-my-ext]` exclusion this module's own header explains.
 *
 * Deliberately omits `color-scheme: dark` (§3.3/§3.4), despite §3.3
 * describing it as part of "the full sheet": this file's own
 * `tests/e2e/specs/adr0002-enforcement-sheet.spec.ts` §3.1 case measured —
 * against the same Chromium build this repo's e2e harness already targets —
 * that adding it does not merely risk the §3.4 shadow-piercing quirk as a
 * possibility to avoid *relying on*, it actively *reproduces* it here: the
 * erase rule's own `background-color: transparent` leaked into an open
 * shadow root's own explicitly-styled child, turning a real
 * `rgb(255, 255, 255)` into `rgba(0, 0, 0, 0)`. That directly breaks §3.1's
 * and §5.2's own guarantee ("the shadow stack stays... retained") — a
 * correctness regression against this step's own acceptance bar, not an
 * acceptable trade. §3.3's UA-canvas/native-control fallback is a real,
 * separate requirement this sheet does not yet meet; re-adding it is
 * follow-up work once it can be done without this side effect (a
 * `color-scheme`-only sheet on its own origin/pass, or re-verifying this
 * quirk is gone in a newer Chromium), not something to ship now on the
 * strength of an ADR clause alone when direct measurement in this exact
 * environment says otherwise.
 */
export function buildEnforcementCSS(swatch: Swatch): string {
  const semanticRules = SEMANTIC_SURFACES.map(
    ({ selector, tier }) =>
      `:where(${selector})${EXT_GUARD} { background-color: ${tier(swatch)} !important; }`
  ).join("\n")

  return `
/* ── ADR 0002 enforcement sheet (user origin) — swatch: ${swatch.id} ─────── */

/* §3.2: specificity-boosted canvas rule — must out-rank ERASE_SELECTOR. */
${CANVAS_SELECTOR} {
  background-color: ${swatch.bg0} !important;
}

/* §2.2/§2.3/§3.5: erase every vendor surface; let the canvas show through.
   background-color/background-image/color are left textually unmodified
   from the ADR's own snippet — see this constant's own header for why
   extension-owned elements are excluded by a separate rule below rather
   than by a guard threaded through this one. border-style/border-width are
   not from that snippet — see this module's own header, "border-width is
   forced, not just border-color", for why they were added on top of it. */
${ERASE_SELECTOR} {
  background-color: transparent !important;
  background-image: none !important;
  color: ${swatch.text0} !important;
  border-color: ${swatch.borderStrong} !important;
  border-style: solid !important;
  border-width: 1px !important;
}

/* §2.3: re-introduce elevation where structure is nameable without reading
   the page. */
${semanticRules}

/* This module's own header: never repaint this extension's own DOM (the
   prepaint veil, the debug overlay) — both carry [data-my-ext]. "all" so a
   future property added to ERASE_SELECTOR/SEMANTIC_SURFACES above is
   covered without this rule needing a matching edit; "revert" (not
   "initial"/"unset") specifically because it rolls back only what *this*
   user-origin sheet would otherwise have contributed, leaving the
   extension's own author-origin styling of these elements (prepaint.css,
   the debug page's own stylesheet) exactly as if this sheet did not exist —
   never falling through to the UA default the way "unset" could. */
[data-my-ext],
[data-my-ext] * {
  all: revert !important;
}
`
}
