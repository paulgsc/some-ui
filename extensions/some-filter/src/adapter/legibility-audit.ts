/**
 * The paint grammar `resolveEffectiveBackdrop`/`ownTextColor`/
 * `auditLegibility` implement below — which CSS categories are `sound`,
 * `heuristic`, or `unknown`, and which test owns each — is documented as a
 * checked decision table in `../../docs/legibility-paint-grammar.md`
 * (TSC-SF1, #1357). Consult it before adding a new category here; it exists
 * so the next gap is a designed table update, not another incident-driven
 * review round.
 *
 * SF-RC1 (#1340) — the second, independent sense→decide→realize sub-pass
 * canon C.6/Definition C.3 (`Φ_comfort`) names as a later story: "once the
 * pipeline can assert *rendered* colors converge to a chosen swatch at
 * all... the same predicate is re-run against the DOM's computed styles."
 * This module is that promotion, scoped to the *legibility* half only (a
 * contrast lower bound) — the actual foreground repair alphabet (tagging a
 * carrier, emitting a hue-preserving foreground rule) is SF-RC2's (#1341),
 * deliberately out of scope here. `realize()` below only ever writes a
 * diagnostic `data-sw-legibility` attribute, never a color.
 *
 * Structurally isolated from `pipeline.ts`'s own Sensor/Estimator/`decide()`:
 * a distinct key space (`LegibilityKey`), a distinct attribute space
 * (`LegibilityAttr`), and a distinct action type (`TagLegibilityAction`)
 * that never enters the `FilterAction` array `pageAlreadyDark()`/`decide()`
 * consume — this channel does not go through transport's generic `Adapter`
 * kernel at all, by design (canon §D.1's zero-leak custody machinery is
 * `pipeline.ts`'s alone; `Φ_comfort` is deliberately not folded into it, see
 * `contracts.ts`'s own header and epic #1338's "The model" section).
 *
 * Wired into `pipeline.ts`'s `fire()` *after* the existing `decide()`/
 * `realize()` settles, inside the same try/catch, gated on an
 * `activate-theme` action actually being present — with no theme applied
 * (no swatch selected, or `pageAlreadyDark()`'s `restore-native`) there is
 * nothing this extension painted to audit; auditing a page's own native
 * contrast is explicitly out of #1338's scope. A throw anywhere in this
 * module is therefore indistinguishable, to `content.ts`'s `onFire` and
 * `document-scope.ts`'s registry, from a thrown `decide()`/`realize()`
 * itself — #1266's `FAILED_HELD` discipline applies unchanged to this
 * channel, not re-derived for it.
 *
 * Deliberately not importing `pipeline.ts`'s own `isRendered`/`ownTextColor`/
 * `SKIP_TAGS`/shadow-root helpers: `pipeline.ts` itself needs to *call* this
 * module's `auditLegibility`/`decideLegibility`/`realizeLegibility` from
 * `fire()`, so importing the other way would be circular — the same
 * constraint `actuator.ts`'s own `isElementNode` doc comment already
 * explains for an identical shape of problem, and the same resolution
 * (a small, stable, private duplicate) rather than restructuring the module
 * graph to share one copy.
 */

import {
  compositeOver,
  contrastRatio,
  parseColor,
  relativeLuminance,
  type RGBA,
} from "@filter/lib/content/color"
import { rgbaToCss } from "@filter/lib/content/modify-colors"

import { isHTMLElementNode } from "./actuator"

/**
 * WCAG 2.1 AA's own normal-text minimum — κ_lo (canon Definition C.3/Remark
 * C.6). κ_hi (bounding a fallback to raw white) governs what SF-RC2's own
 * repair selects, not what this audit flags: an unmodified, already-legible
 * carrier this extension never touched is not a violation merely for being
 * high-contrast.
 */
export const MIN_CONTRAST_RATIO = 4.5

/** The same "unknown == light" bias `pipeline.ts`'s `readHtmlCanvasAttr`/`ASSUMED_LIGHT_IMAGE` apply to an equivalent gap in the vendor-evidence Sensor, applied here to an ancestor chain that never resolves an opaque layer of its own. */
const ASSUMED_CANVAS: RGBA = [1, 1, 1, 1]

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "LINK",
  "META",
  "NOSCRIPT",
  "IMG",
  "VIDEO",
  "CANVAS",
  "AUDIO",
  "PICTURE",
  "EMBED",
  "OBJECT",
  "SVG",
])

function isExtensionOwned(el: Element): boolean {
  if (el.id === "__sw_overlay_root") return true
  if (el.hasAttribute("data-my-ext")) return true
  if (el.closest("[data-my-ext]")) return true
  return false
}

/**
 * `visibility` is an inherited CSS property, so a descendant's own computed
 * value already reflects an ancestor's `visibility:hidden` unless it
 * explicitly overrides back to `visible` — the carrier's own computed style
 * is sufficient for that half. `display` is not inherited: a real browser's
 * `getComputedStyle` on a descendant reports *that element's own* computed
 * `display` (e.g. `"block"`) regardless of an ancestor's `display:none`
 * (bot-found — confirmed as standard behavior, not a jsdom quirk: an
 * ancestor's `display:none` removes the whole subtree from rendering
 * without changing what a descendant's own `display` property computes
 * to), so this walks every ancestor up to `document.documentElement`
 * checking each one's *own* computed `display` — mirroring, for
 * renderedness, the same per-ancestor walk `resolveEffectiveBackdrop` does
 * for backdrop color, and for the identical reason: a value read only from
 * the carrier itself cannot see a hazard sitting further up the tree.
 */
function isRendered(el: Element, style: CSSStyleDeclaration): boolean {
  if (style.display === "none" || style.visibility === "hidden") return false

  let cur: Element | null = el.parentElement
  while (cur !== null) {
    if (getComputedStyle(cur).display === "none") return false
    if (cur === document.documentElement) break
    const parent: Element | null = cur.parentElement
    if (parent !== null) {
      cur = parent
      continue
    }
    const parentNode: Node | null = cur.parentNode
    cur =
      parentNode !== null && isShadowRoot(parentNode) ? parentNode.host : null
  }
  return true
}

function isShadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === Node.DOCUMENT_FRAGMENT_NODE
}

const NO_COLOR_SENTINELS = new Set(["", "none", "transparent"])

/**
 * True when `css` is either an explicit "no color" sentinel or a syntax
 * `parseColor`/`parsePreciseColor` actually understand (hex or
 * `rgb()`/`rgba()`) — i.e. a value whose `null` parse result is *meaningful*
 * (genuinely absent, or present but negligibly transparent), not a syntax
 * neither parser was ever built to decode at all (CSS Color 4 forms —
 * `oklch()`, `lab()`, `lch()`, `color(display-p3 …)` — that a real
 * browser's `getComputedStyle` can serialize `color`/`background-color` as
 * today). Shared by `ownTextColor`'s foreground check and
 * `resolveEffectiveBackdrop`'s own background-color check below — both
 * need the identical disambiguation, for the identical reason: silently
 * treating an undecodable color as "no color" can hide a fully opaque,
 * fully real layer entirely.
 */
function isRecognizedColorSyntax(css: string): boolean {
  return (
    NO_COLOR_SENTINELS.has(css) || css.startsWith("#") || css.startsWith("rgb")
  )
}

/**
 * Like `color.ts`'s `parseColor`, but *without* that function's own near-
 * invisible alpha cutoff (`a < 0.05`) — that cutoff is correct for
 * `pipeline.ts`'s own vendor-evidence Sensor (a barely-visible layer is
 * negligible for "does this surface need retheming"), but wrong for exact
 * contrast compositing: a translucent layer, foreground *or* background,
 * still contributes to what actually renders, and near a threshold that
 * contribution can flip the verdict (bot-found, twice: `rgba(0,0,0,0.04)`
 * text over white renders as essentially white-on-white — a real
 * violation `parseColor`'s cutoff would otherwise drop entirely; a
 * `rgba(255,255,255,0.04)` *backdrop* layer over `rgb(114,114,114)`
 * measurably shifts the composited color enough to flip a borderline
 * contrast ratio from passing to violated if silently skipped). Used by
 * both `ownTextColor`'s foreground read and `resolveEffectiveBackdrop`'s
 * own background-color read below. Duplicates just the rgb()/rgba() regex
 * path rather than reworking `parseColor` itself, whose existing cutoff
 * stays correct for its other (page-classification) callers.
 */
function parsePreciseColor(css: string): RGBA | null {
  if (css.startsWith("#")) return parseColor(css)
  const match = css.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/
  )
  if (match === null) return null
  const [, r, g, b, alpha] = match
  if (r === undefined || g === undefined || b === undefined) return null
  const a = alpha === undefined ? 1 : Number.parseFloat(alpha)
  if (a <= 0) return null
  return [
    Number.parseInt(r, 10) / 255,
    Number.parseInt(g, 10) / 255,
    Number.parseInt(b, 10) / 255,
    a,
  ]
}

let supportsPseudoElementStyle: boolean | undefined

/**
 * `getComputedStyle`'s own two-argument form (`getComputedStyle(el,
 * "::before")`) is the only way to read a generated pseudo-element's own
 * resolved style — but jsdom does not implement it (TSC-SF2, #1358):
 * confirmed directly against jsdom's own source (`Window.js`), a truthy
 * `pseudoElt` argument logs a "not implemented" warning and then falls
 * through to computing and returning the *host* element's own declaration,
 * completely ignoring the pseudo argument. Naively calling
 * `hasGeneratedPseudoHazard` below without this guard would therefore
 * misread every jsdom-run element's own (real) `content`/`background-color`
 * as if it belonged to that element's `::before`, corrupting essentially
 * every existing candidate in this file's own jsdom unit tests, not just
 * leaving the new check untested.
 *
 * Distinguishes real support from jsdom's pass-through with a single, one-
 * time probe rather than sniffing the environment by name. First landed
 * probing `document.documentElement` directly, which a real audited page
 * (as opposed to this file's own tests) can trivially defeat with its own
 * `html::before` rule (bot-found, Codex review round 1: confirmed directly,
 * `<style>html::before { content: "loading" }</style>` permanently
 * misdetected real support as absent, silently disabling this entire
 * hazard check for the page's whole lifetime). Switching only the probed
 * *element* (a synthetic, invented tag name no real page's stylesheet
 * targets by name) closed that but not the more general case (bot-found,
 * Codex review round 2: confirmed directly, a page-wide `*::before {
 * content: "" }` — an ordinary, if unusual, universal-selector rule —
 * still matches *any* element by tag name, including an invented one, the
 * same way it would match every other element on the page).
 *
 * Isolates the probe in a genuinely separate style-scoping context instead:
 * a `ShadowRoot` (`mode: "closed"`, though closed vs. open makes no
 * difference here — it only gates *external* code calling
 * `host.shadowRoot`, not a direct reference this function already holds).
 * Confirmed directly: a light-DOM `*::before` rule cannot select an element
 * inside a shadow tree at all, by the same style-scoping the platform
 * already guarantees for `:host`/slotted content — the probe correctly
 * reports `content: "none"` even with that exact universal rule in effect,
 * with or without the synthetic tag name (kept anyway, cheap and still
 * closes off attribute/class-based universal selectors like `[id]::before`
 * or `*[class]::before`, however unlikely). Everything is created, probed,
 * and torn down synchronously within one host element never left attached
 * — no lasting DOM footprint, no visible flash (browsers do not paint mid-
 * synchronous-task).
 *
 * A spec-correct implementation reliably reports `content: "none"` for
 * this untouchable probe (confirmed directly against this repo's own
 * Playwright-bundled Chromium) while jsdom's pass-through reports whatever
 * the *probe element's own* `content` property computes to — `""`, never
 * `"none"`, since jsdom does not implement the `content` CSS property on
 * ordinary elements either (confirmed directly). Memoized: `getComputedStyle`
 * is not free, and this module's own `auditLegibility`/
 * `resolveEffectiveBackdrop` walks call the function below once per visited
 * element/ancestor.
 */
function pseudoElementStyleIsSupported(): boolean {
  if (supportsPseudoElementStyle === undefined) {
    const host = document.createElement("sw-legibility-pseudo-probe-host")
    const shadow = host.attachShadow({ mode: "closed" })
    const probe = document.createElement("sw-legibility-pseudo-probe")
    shadow.appendChild(probe)
    document.documentElement.appendChild(host)
    supportsPseudoElementStyle =
      getComputedStyle(probe, "::before").content === "none"
    host.remove()
  }
  return supportsPseudoElementStyle
}

/**
 * `::before`/`::after`/`::marker` are real paint layers `auditLegibility`'s
 * `TreeWalker` structurally cannot see — none of them are nodes, so none
 * can ever enter a `SHOW_ELEMENT` walk (TSC-SF2, #1358; the exact gap
 * `docs/legibility-paint-grammar.md`'s own `PG-GEN-PSEUDO` row recorded as
 * `unknown`). A decorative `::before`/`::after` capable of painting a real
 * background over/behind a carrier's own glyph, or a `::marker` carrying a
 * color independent of its host's, can each currently produce a false
 * `"legible"` verdict — or simply never enter this audit at all if the host
 * itself has no explicit own color for `ownTextColor` to find. This is a
 * *bounded* hazard check, not real occlusion geometry (this module does not
 * attempt paint-order/bounding-box analysis anywhere else either, see
 * `hasPositioningHazard`'s own doc comment on the identical limitation): it
 * conservatively flags `"underdetermined"` whenever a generated pseudo-
 * element could plausibly paint something the host's own resolved
 * foreground doesn't already account for, rather than trying to resolve
 * what actually renders.
 *
 * Called from two places, against every hazard this same function can find
 * on `el` either way: `auditLegibility`'s own call site checks only the
 * *candidate itself*, for its own foreground channel; `resolveEffectiveBackdrop`
 * checks every element in an ancestor *chain*, unconditionally to
 * `document.documentElement` regardless of where color accumulation itself
 * resolves — the same unconditional treatment `hasGroupCompositingHazard`
 * already gets, and for an identical reason (bot-found, Codex review round
 * 1, corrected in round 2 after a first fix still gated this on
 * `resolved === null`: an ancestor's own pseudo-element — e.g. a
 * `position: fixed` overlay anchored to no particular containing block, so
 * `hasPositioningHazard` alone would not catch it either — can visibly
 * paint over a completely unrelated descendant `el` never has any other
 * own relationship to, regardless of whether some *nearer* ancestor's own
 * background already resolved fully opaque; a positioned pseudo-element is
 * not subject to ordinary paint z-order the way an ordinary background-image
 * is, so it cannot be treated as occludable the way `hasOccludableImageHazard`
 * is).
 *
 * `::before`/`::after`: a real Chromium probe (confirmed directly — jsdom
 * cannot exercise this at all, see `pseudoElementStyleIsSupported`'s own
 * doc comment) shows `content` reliably distinguishes "no such pseudo-
 * element" (`"none"`) from "one exists" (the CSS-serialized form of
 * whatever `content` resolves to, e.g. `'""'` for an authored empty string,
 * `'"x"'` for real text). `display` alone carries no such signal — real
 * Chromium reports `"inline"` for `::before`'s own computed `display`
 * unconditionally, even on an element with *no* `::before` rule at all —
 * but once `content` has already confirmed a rule exists, `display` does
 * become meaningful: an author can retain a `content` declaration while
 * conditionally suppressing the pseudo-element entirely via `display: none`
 * (bot-found, Codex review round 3: a real, plausible authoring pattern —
 * e.g. a responsive breakpoint hiding a decorative `::before` — which
 * generates no box and paints nothing at all despite a non-`"none"`
 * `content`; confirmed directly that a real Chromium `::before` with both
 * `content: "x"` and `display: none` authored together reports
 * `display: "none"`, distinctly from the same rule without it reporting
 * `"inline"`). `visibility: hidden` is the identical case for a box that
 * *does* still generate (unlike `display: none`, it keeps the box in
 * layout, only suppressing its own paint) — checked the same way and for
 * the same reason (bot-found, Codex's own closing review of this PR:
 * confirmed directly that a real Chromium `::before` with `content: "x"`
 * and `visibility: hidden` reports `visibility: "hidden"`, distinctly from
 * `"visible"`, while its own `display` stays `"inline"` regardless — so
 * `display` alone would not have caught this one). Both are checked for
 * the real-content and empty-content cases alike, before either paint
 * check below ever runs. An authored empty string (`content: ""`, the
 * ordinary clearfix idiom) generates a box but
 * paints nothing *unless* it also carries its own background, border,
 * outline, or box-shadow (bot-found, Codex review round 1: a border or
 * box-shadow alone, with no background at all, still paints a real,
 * potentially occluding shape — confirmed directly that a real Chromium
 * border/outline computes `borderStyle`/`outlineStyle` as `"none"` and
 * `borderWidth`/`outlineWidth` as `"0px"` when absent, a real, single-value
 * `"Npx"`/named style otherwise, and `boxShadow` as the literal string
 * `"none"` when absent) — flagging every clearfix hack on every page as
 * `"underdetermined"` would make this check far noisier than the risk it
 * guards against, so that one case is excluded unless one of these four is
 * also present. The background check uses `isRecognizedColorSyntax`
 * alongside `parsePreciseColor`, mirroring `resolveEffectiveBackdrop`'s own
 * background-color handling (bot-found, Codex review round 2: a CSS Color 4
 * background such as `oklch(0 0 0)` is real, opaque, real-Chromium-rendered
 * paint that `parsePreciseColor` alone cannot decode — hex/`rgb()` only —
 * so treating its `null` parse result as "no paint" the same as a genuine
 * `NO_COLOR_SENTINELS` value would silently exempt a real, occluding
 * background this module simply doesn't know how to parse).
 *
 * `::marker`: generated for any host with computed `display: list-item`
 * (confirmed directly — a non-list-item element still returns a full
 * `::marker` declaration from `getComputedStyle`, so `display` on the
 * *marker itself* carries no signal here either; the host's own `display`
 * is what actually gates whether a marker box exists). Compares the
 * marker's own computed `color` against the host's own computed `color` —
 * the same "equal means nothing is overriding, unequal means something
 * genuinely is" comparison `ownTextColor`'s own `-webkit-text-fill-color`
 * guard already established as sound for an identical shape of problem
 * (#1374): confirmed directly that an ordinary `<li>` with no marker color
 * override has `getComputedStyle(el, "::marker").color ===
 * getComputedStyle(el).color`, and that an explicit `::marker { color: … }`
 * rule makes them differ.
 */
function hasGeneratedPseudoHazard(
  el: Element,
  style: CSSStyleDeclaration
): boolean {
  if (!pseudoElementStyleIsSupported()) return false

  for (const pseudo of ["::before", "::after"] as const) {
    const pseudoStyle = getComputedStyle(el, pseudo)
    if (pseudoStyle.content === "none") continue
    if (pseudoStyle.display === "none") continue
    if (pseudoStyle.visibility === "hidden") continue
    if (pseudoStyle.content === '""') {
      const hasBackgroundColor =
        parsePreciseColor(pseudoStyle.backgroundColor) !== null ||
        !isRecognizedColorSyntax(pseudoStyle.backgroundColor)
      const hasBackgroundImage =
        pseudoStyle.backgroundImage !== "" &&
        pseudoStyle.backgroundImage !== "none"
      const hasBorder =
        pseudoStyle.borderStyle !== "none" && pseudoStyle.borderWidth !== "0px"
      const hasOutline =
        pseudoStyle.outlineStyle !== "none" &&
        pseudoStyle.outlineWidth !== "0px"
      const hasBoxShadow = pseudoStyle.boxShadow !== "none"
      if (
        !hasBackgroundColor &&
        !hasBackgroundImage &&
        !hasBorder &&
        !hasOutline &&
        !hasBoxShadow
      ) {
        continue
      }
    }
    return true
  }

  if (style.display === "list-item") {
    const markerStyle = getComputedStyle(el, "::marker")
    if (markerStyle.color !== style.color) return true
  }

  return false
}

/**
 * Mirrors `pipeline.ts`'s own `ownTextColor` (own private copy — see this
 * module's header for why), broadened to a three-way result: `null` means
 * no own color at all (plain inheritance, or an explicit-but-invisible
 * declaration like `color: transparent` — nothing to audit either way);
 * `"underdetermined"` means an own, non-inherited declaration exists that
 * neither `parsePreciseColor` nor the sentinel check below can decode —
 * CSS Color 4 forms (`oklch()`, `lab()`, `lch()`, `color(display-p3 …)`)
 * that a real browser's `getComputedStyle` can serialize `color` as today
 * (bot-found: silently returning `null` here dropped such a carrier from
 * candidacy *entirely*, auditing nothing, even when the themed backdrop
 * made it genuinely illegible — worse than flagging it, which is what
 * every other unresolvable case in this module already does).
 *
 * Computed-value equality alone cannot distinguish genuine inheritance
 * from an explicit declaration that merely *coincides* with the parent's
 * value (`<div style="color:black"><div style="color:black;background:
 * white">…` — the epic's own Gate-0 recon calls this "escape route 2," and
 * it is real: a nested control explicitly repeating its container's color
 * for visual consistency is an ordinary authoring pattern, not a
 * contrivance). An own *inline* `style.color` is unambiguous proof of an
 * explicit declaration regardless of what value it happens to share with
 * the parent, so it is checked first, before the equality short-circuit —
 * closing the inline-style instance of escape route 2, which is what the
 * epic's own recon reproduced. A stylesheet-rule-based coincidental match
 * (no inline style, but a class rule sets the identical color) remains
 * undetected — reliably distinguishing that from real inheritance would
 * need CSSOM rule-matching this function does not attempt.
 *
 * Uses `isHTMLElementNode` (realm-independent — `nodeType`/`namespaceURI`,
 * not a prototype check), not `instanceof HTMLElement`, for the inline-
 * color guard: a same-origin-iframe-adopted element (`actuator.ts`'s own
 * `isHTMLElementNode` doc comment has the full mechanism) keeps that other
 * realm's `HTMLElement` constructor on its prototype chain, failing
 * `instanceof` against *this* realm's `HTMLElement` even though it is
 * genuine — which would have silently defeated this very fix for exactly
 * the adopted elements SF-AD's own review (round 3) already found this
 * class of bug on elsewhere in the codebase (bot-found here too).
 *
 * Checks `-webkit-text-fill-color` first, before any of the `color`-based
 * logic above even runs: when explicitly set (its own initial value is
 * `currentcolor`, meaning "defer to `color`"), that property — not `color`
 * — is what actually determines the rendered glyph fill (a real, if
 * legacy, pattern: `background-clip: text` gradient-text authoring
 * routinely sets `color` to one value as a non-gradient fallback and this
 * to another, or to `transparent`, for the real paint). This module does
 * not model that property's own separate cascade, so a carrier using it is
 * flagged `"underdetermined"` rather than silently trusting `color`, which
 * could be arbitrarily wrong for it (bot-found).
 *
 * Compares the *computed* `-webkit-text-fill-color` against the computed
 * `color` on this same element, rather than checking either in isolation
 * (bot-found, #1374, corrected after a first fix regressed the exact case
 * below — both confirmed directly against real Chromium):
 *
 *   - Reading the computed `-webkit-text-fill-color` alone is wrong: it
 *     resolves to a concrete `rgb(...)` color for *every* element in real
 *     Chromium, mirroring `color`, even with no such declaration anywhere
 *     — never `""` nor the literal string `"currentcolor"` — so a bare
 *     "is it set" check fires unconditionally, short-circuiting every
 *     carrier to `"underdetermined"` before any of the logic below runs.
 *     jsdom's own tests passed regardless, because jsdom preserves the
 *     literal `"currentcolor"` string, which is not representative.
 *   - Reading only `el.style` (the inline specified value) avoids that,
 *     but silently stops detecting the property's two other real sources:
 *     a stylesheet rule (the actual `background-clip: text` pattern —
 *     `color` set inline as a fallback, the real fill supplied by a
 *     shared class) and inheritance from an ancestor. Both leave `el.style`
 *     empty while still controlling the rendered glyph — a carrier with
 *     `color: white` and a class-provided `-webkit-text-fill-color: #111`
 *     would be audited as legible white text, when the glyph actually
 *     painted is `#111`.
 *
 * Comparing the two *computed* values sidesteps both failure modes at
 * once: `-webkit-text-fill-color`'s own initial value is `currentcolor`
 * ("defer to `color`"), which a real browser resolves relative to *this
 * element's own* `color` fresh at every element (confirmed directly: an
 * element with no declaration anywhere always has
 * `getComputedStyle(el).getPropertyValue("-webkit-text-fill-color") ===
 * getComputedStyle(el).color`, regardless of what an ancestor declares).
 * So when the two computed values are equal, nothing is currently
 * overriding the rendered fill away from `color` — from *any* source,
 * inline, stylesheet, or inherited — and it is safe to fall through to the
 * `color`-based logic below. jsdom's own unset value (`""`, or the literal
 * keyword `"currentcolor"` it preserves rather than resolving) is handled
 * by the two explicit checks ahead of the comparison, so this never
 * depends on jsdom's own non-representative resolution behavior. When the
 * two computed values differ, an explicit fill is in effect this module
 * does not model the cascade of, so the carrier is flagged
 * `"underdetermined"` rather than silently trusting `color`, which could
 * be arbitrarily wrong for it.
 */
function ownTextColor(
  el: Element,
  style: CSSStyleDeclaration
): RGBA | "underdetermined" | null {
  const webkitTextFillColor = style.getPropertyValue("-webkit-text-fill-color")
  if (
    webkitTextFillColor !== "" &&
    webkitTextFillColor !== "currentcolor" &&
    webkitTextFillColor !== style.color
  ) {
    return "underdetermined"
  }

  const parent = el.parentElement
  const parentNode = el.parentNode
  const inheritFrom =
    parent ??
    (parentNode !== null && isShadowRoot(parentNode) ? parentNode.host : null)
  if (inheritFrom === null) return null

  const hasOwnInlineColor = isHTMLElementNode(el) && el.style.color !== ""
  if (!hasOwnInlineColor) {
    const inherited = getComputedStyle(inheritFrom).color
    if (style.color === inherited) return null
  }

  const parsed = parsePreciseColor(style.color)
  if (parsed !== null) return parsed

  return isRecognizedColorSyntax(style.color) ? null : "underdetermined"
}

/**
 * A background-image, gradient or real photo alike: a plain paint layer
 * that a fully opaque layer painted *on top of* it (closer to the carrier)
 * genuinely occludes — ordinary z-order, nothing left for this predicate to
 * worry about once `resolved` is set. Checked only while color
 * accumulation is still in progress; see `hasGroupCompositingHazard` below
 * for the hazards that occlusion does *not* neutralize.
 */
function hasOccludableImageHazard(style: CSSStyleDeclaration): boolean {
  return style.backgroundImage !== "" && style.backgroundImage !== "none"
}

/**
 * True for any positioning scheme (`relative`, `absolute`, `fixed`,
 * `sticky`) under which an element's *rendered* location is no longer
 * guaranteed to be the union of its DOM ancestors' own painted boxes — the
 * load-bearing assumption every other check in this walk depends on (bot-
 * found: a `position: absolute` (or `fixed`) element can be moved anywhere
 * on the page, overlapping a sibling or unrelated content entirely; even
 * `relative` shifts an element away from where its ancestors would
 * otherwise place it). Checked only while `resolved === null` — the exact
 * portion of the chain whose color the walk actually uses; an outer
 * ancestor whose own positioning played no role in the color already
 * settled on need not be flagged.
 *
 * This is a bounded, *partial* mitigation, not a general fix: it closes
 * the dominant, most severe case (an element taken out of normal flow
 * entirely) but not every way DOM nesting can diverge from paint order —
 * negative margins, CSS transforms, or floats can also move painted
 * content away from its ancestor's box while staying `position: static`.
 * Reliably catching all of those would need real geometry (`getBoundingClientRect`
 * comparisons) or paint-order analysis, not a computed-style read — a much
 * larger undertaking this module does not attempt.
 */
function hasPositioningHazard(style: CSSStyleDeclaration): boolean {
  return style.position !== "" && style.position !== "static"
}

/**
 * True when `style` carries a rendering feature that composites its
 * *entire* element — background, text, and every descendant together — as
 * one group against whatever sits behind it: a CSS filter, a backdrop-
 * filter, a non-normal blend mode, or non-1 opacity. Unlike a background-
 * image (`hasOccludableImageHazard` above), none of these can be shielded
 * by a descendant's own opaque background — the descendant is composited
 * *inside* the group before the group effect itself is applied (bot-found:
 * an outer `filter: brightness(0)` still recolors an already-fully-opaque
 * inner child's rendered output; a naive occlusion check that stopped once
 * color resolved missed exactly this). Must therefore be checked for every
 * ancestor up to `document.documentElement`, regardless of where color
 * accumulation itself resolves.
 *
 * `""` is treated identically to the spec's own unset default
 * (`"none"`/`"normal"`/`1`) for every one of these — jsdom's computed style
 * leaves `filter`/`mix-blend-mode`/`backdrop-filter`/`opacity` all at `""`
 * rather than their spec-defined defaults for an element with no explicit
 * declaration (confirmed directly against jsdom, not assumed), so treating
 * only the literal spec string as "nothing to worry about" would
 * misclassify almost every ordinary element in this test environment as a
 * hazard.
 */
function hasGroupCompositingHazard(style: CSSStyleDeclaration): boolean {
  const isUnsetOr = (value: string, none: string): boolean =>
    value !== "" && value !== none

  if (isUnsetOr(style.filter, "none")) return true
  if (isUnsetOr(style.mixBlendMode, "normal")) return true
  // getPropertyValue (rather than the camelCase accessor) always returns a
  // plain string — jsdom does not implement backdrop-filter at all, so this
  // is "" unconditionally there, same as every other unset case above.
  if (isUnsetOr(style.getPropertyValue("backdrop-filter"), "none")) return true

  // Number.parseFloat("") is NaN, excluded from the `< 1` check by
  // construction — the same "nothing to worry about" outcome a real
  // browser's spec-correct default of `1` would also produce.
  const opacity = Number.parseFloat(style.opacity)
  if (!Number.isNaN(opacity) && opacity < 1) return true

  return false
}

/**
 * Resolves the single composited color directly behind `el`'s own painted
 * content: `el`'s own background (if any), alpha-composited over every
 * ancestor's own background in turn (innermost first — Porter-Duff `over`,
 * `color.ts`'s `compositeOver`), stopping at the first fully opaque layer or
 * at `document.documentElement`. An ancestor chain that never resolves an
 * opaque layer composites its own remaining transparency against assumed
 * white (`ASSUMED_CANVAS`) rather than returning an unresolved partial alpha
 * — the browser's own default canvas paint.
 *
 * Returns `"underdetermined"` when any ancestor trips
 * `hasGroupCompositingHazard` or `hasGeneratedPseudoHazard` — both checked
 * all the way to `document.documentElement` regardless of where color
 * accumulation itself resolves, since neither can be occluded by an inner
 * opaque layer (bot-found, Codex review round 1: an *ancestor's* own
 * `::before`/`::after`/`::marker` — e.g. a `position: fixed` overlay
 * anchored to no particular containing block at all, so `hasPositioningHazard`
 * alone does not catch it either — can visibly paint over a completely
 * unrelated descendant this same ancestor chain leads to, regardless of
 * whether some *nearer* ancestor already resolved an opaque background;
 * round 2 caught that the first fix still gated this check on
 * `resolved === null`, same as the genuinely occludable hazards below,
 * which stopped checking it the moment any ancestor did resolve — a
 * `position: fixed`/high-`z-index` pseudo-element is not subject to
 * ordinary paint z-order at all, so it needs `hasGroupCompositingHazard`'s
 * own unconditional treatment, not `hasOccludableImageHazard`'s) — or when
 * a still-unresolved layer trips `hasOccludableImageHazard` (a background-
 * image *before* anything opaque has painted over it is very much still
 * visible) or `hasPositioningHazard` (a non-`static` element's rendered
 * location isn't guaranteed to match its DOM ancestors' boxes at all).
 * Color accumulation itself stops once fully opaque — there is nothing
 * further out left to composite, and a background-image beyond that point
 * is genuinely occluded, ordinary paint z-order (bot-found: treating an
 * occluded outer background-image the same as an unoccludable group hazard
 * misclassified an ordinary opaque-card-over-hero-image layout as
 * underdetermined even though its backdrop is fully known). Background-
 * color parsing uses `parsePreciseColor`, not `parseColor` — see that
 * function's own doc comment for why the exact-compositing case needs a
 * different alpha policy than page-classification evidence does.
 */
export function resolveEffectiveBackdrop(
  el: Element
): RGBA | "underdetermined" {
  let acc: RGBA = [0, 0, 0, 0]
  let resolved: RGBA | null = null
  let cur: Element | null = el

  while (cur !== null) {
    const style = getComputedStyle(cur)
    if (hasGroupCompositingHazard(style)) return "underdetermined"
    if (hasGeneratedPseudoHazard(cur, style)) return "underdetermined"

    if (resolved === null) {
      if (hasPositioningHazard(style)) return "underdetermined"
      if (hasOccludableImageHazard(style)) return "underdetermined"

      // display:contents generates no box at all, so this element's own
      // background-color (if any) is never actually painted — its
      // descendants render directly against whatever sits behind *it*,
      // i.e. its parent. Treating a boxless element's background as a real
      // paint layer let it incorrectly "win" as the resolved backdrop
      // (bot-found).
      if (style.display !== "contents") {
        const layerColor = parsePreciseColor(style.backgroundColor)
        if (layerColor !== null) {
          acc = compositeOver(acc, layerColor)
          if (acc[3] >= 0.999) resolved = [acc[0], acc[1], acc[2], 1]
        } else if (!isRecognizedColorSyntax(style.backgroundColor)) {
          // A real, non-transparent background-color declaration sits here
          // that parseColor cannot decode (CSS Color 4 forms) — silently
          // treating it as "no color, keep climbing" could hide a fully
          // opaque layer entirely (bot-found: an opaque oklch() white
          // background would otherwise let a themed ancestor further out
          // "win" the resolved color instead, understating the real,
          // possibly catastrophic, contrast against it).
          return "underdetermined"
        }
      }
    }

    if (cur === document.documentElement) break

    const parent: Element | null = cur.parentElement
    if (parent !== null) {
      cur = parent
      continue
    }
    const parentNode: Node | null = cur.parentNode
    cur =
      parentNode !== null && isShadowRoot(parentNode) ? parentNode.host : null
  }

  return resolved ?? compositeOver(acc, ASSUMED_CANVAS)
}

export type LegibilityKey = string

export type ContrastVerdict = "violated" | "underdetermined"

export type LegibilityAttr = {
  readonly foreground: RGBA | "underdetermined"
  readonly backdrop: RGBA | "underdetermined"
}

export type LegibilityScanResult = {
  readonly elementsByKey: ReadonlyMap<LegibilityKey, ReadonlyArray<Element>>
  readonly attrsByKey: ReadonlyMap<LegibilityKey, LegibilityAttr>
}

export type TagLegibilityAction = {
  readonly kind: "tag-legibility"
  readonly key: LegibilityKey
  readonly verdict: ContrastVerdict
}

function legibilityKeyFor(attr: LegibilityAttr): LegibilityKey {
  const foregroundKey =
    attr.foreground === "underdetermined"
      ? "underdetermined"
      : rgbaToCss(attr.foreground)
  const backdropKey =
    attr.backdrop === "underdetermined"
      ? "underdetermined"
      : rgbaToCss(attr.backdrop)
  return `${foregroundKey}~${backdropKey}`
}

function registerCandidate(
  node: Element,
  attr: LegibilityAttr,
  elementsByKey: Map<LegibilityKey, Array<Element>>,
  attrsByKey: Map<LegibilityKey, LegibilityAttr>
): void {
  const key = legibilityKeyFor(attr)
  const list = elementsByKey.get(key)
  if (list !== undefined) {
    list.push(node)
  } else {
    elementsByKey.set(key, [node])
    attrsByKey.set(key, attr)
  }
}

/**
 * The `<style>` element SF-RC2's own repair alphabet
 * (`foreground-repair.ts`) writes its foreground-only rules into. Declared
 * *here*, rather than in that module, because this module's own sensing
 * pass is what has to know which sheet to suppress while it reads — and
 * this direction (repair imports audit) is the only one that avoids a
 * cycle, since `foreground-repair.ts` already consumes this module's
 * `LegibilityAttr`/`LegibilityKey`/`MIN_CONTRAST_RATIO`.
 *
 * Also listed in `pipeline.ts`'s own `OWN_COLOR_SHEET_IDS`, so the
 * *vendor-evidence* Sensor (`scan()`, inside `withVendorColorsVisible`)
 * never folds this channel's own foreground output back in as fresh vendor
 * evidence — #831's exact failure mode, one channel over.
 */
export const REPAIR_STYLE_ID = "__sw_legibility_repair"

/** The sheet holding the scoped transition freeze `withRepairSuppressed` reads under. */
export const FREEZE_STYLE_ID = "__sw_legibility_freeze"

/**
 * `foreground-repair.ts`'s own `REPAIR_ATTR`, duplicated here rather than
 * imported: that module already imports this one, so the other direction
 * would be circular — the same small-stable-duplicate resolution this
 * file's own header explains for `isRendered`/`SKIP_TAGS`. The freeze below
 * is scoped by it, so the two must agree.
 */
const REPAIR_ATTR = "data-sw-legibility-fix"

/**
 * The transition freeze `withRepairSuppressed` reads under, as a
 * *persistent, disabled-by-default* extension-owned sheet rather than a
 * `<style>` appended and removed around each read.
 *
 * `prepaint.ts`'s own `withPrepaintSuppressed` does that append-and-remove,
 * and it is correct there — it runs once, outside the Sensor's observation
 * window. Reusing it here does not work, and not subtly: `isSelfAuthored`
 * deliberately does *not* treat the removal of an extension-owned node as
 * self-authored (Remark 7.2 — "our node is gone" is ambiguous between our
 * teardown and the vendor's, and the ambiguity has to resolve toward
 * reacting). So tearing the freeze down at the end of every audit queues a
 * mutation the Sensor reacts to, whose round audits again, which tears it
 * down again — a self-feeding loop, #831's exact shape. Caught by this
 * package's own quiescence tests, which measured six rounds where one was
 * expected before this was reduced to a `disabled` toggle. Toggling
 * `CSSStyleSheet.disabled` mutates no DOM at all, the same reason
 * `pipeline.ts`'s `withVendorColorsVisible` suppresses its own sheets that
 * way.
 *
 * Scoped to `[${REPAIR_ATTR}]`, and declaring `transition` only — not
 * `*` and not `animation` — because the freeze exists solely to stop *this
 * extension's own* sheet toggle from starting a transition on a carrier it
 * repaired. Anything wider is collateral damage, and measurably so
 * (bot-found, Codex's own closing review of this PR; confirmed directly
 * against real Chromium with a `*`-scoped freeze declaring both):
 *
 *   - `animation: none` *removes* a running animation rather than pausing
 *     it. A spinner measured at `currentTime` 799.9ms had zero animations
 *     during the freeze and came back at `currentTime` 0 — restarted from
 *     the beginning, not resumed. On a page reconciling often enough, a
 *     vendor animation would never visibly progress at all. Nothing in this
 *     channel ever needed it: an `@keyframes` animation is not something a
 *     stylesheet toggle can start.
 *   - A `*` scope cancels in-flight transitions on elements this extension
 *     never touched. A control mid-fade at `rgb(20, 20, 20)` jumped
 *     straight to its `rgb(255, 255, 255)` destination.
 *
 * The same probe with this scope left the spinner's animation running
 * untouched. What remains in scope is exactly the necessary cost: a carrier
 * this channel has already repaired, whose in-flight colour transition is
 * snapped to its destination for the duration of one synchronous read —
 * which is the settled value the read is after in the first place.
 */
function freezeSheet(): CSSStyleSheet | null {
  const existing = document.getElementById(FREEZE_STYLE_ID)
  if (existing instanceof HTMLStyleElement) return existing.sheet

  const style = document.createElement("style")
  style.id = FREEZE_STYLE_ID
  style.setAttribute("data-my-ext", "")
  style.textContent = `[${REPAIR_ATTR}] { transition: none !important; }`
  document.head.appendChild(style)
  const sheet = style.sheet
  // Inert until a read actually needs it. The window between append and
  // this line is synchronous, so no frame is ever painted with page
  // transitions suppressed.
  if (sheet !== null) sheet.disabled = true
  return sheet
}

/**
 * Runs `fn` with SF-RC2's repair sheet disabled, so every
 * `getComputedStyle().color` read inside it returns the carrier's *authored*
 * foreground rather than the repair this channel painted over it.
 *
 * Without this the channel oscillates, and visibly: a repaired carrier
 * reads back as legible on the very next round (our own `!important` rule
 * is what makes it so), `decideLegibility` therefore emits nothing for it,
 * `realizeLegibility`/`realizeForegroundRepairs` drop the tag and the rule
 * as stale, the carrier reverts to its illegible authored color, and the
 * round after that re-detects and re-repairs it — a flicker driven by
 * nothing but the extension's own output. Re-deriving the same violation
 * from the same authored evidence every round is what makes the repair a
 * genuine fixed point instead (Theorem 7.2's zero-write idempotency:
 * identical DOM state, identical actions, no writes).
 *
 * Background resolution is deliberately *not* suppressed — the repair sheet
 * only ever declares `color`, so it cannot perturb
 * `resolveEffectiveBackdrop`, and the backdrop this audit measures against
 * must remain the post-actuation one (the themed surface actually painted).
 *
 * `CSSStyleSheet.disabled` rather than detaching the element, for the same
 * reason `pipeline.ts`'s own `withVendorColorsVisible` does it that way: it
 * mutates no DOM (so it queues no MutationRecord to react to) and, because
 * the whole audit is one synchronous task, no frame is ever painted with
 * the repair off.
 *
 * Both the read and the restore happen with transitions frozen
 * (`freezeSheet` below), which is what makes the read report the *settled*
 * authored colour. Disabling the repair sheet is itself a style change, so
 * on a carrier with a vendor `transition` on `color` it starts a transition
 * away from the repair — and a `getComputedStyle` taken in the same task
 * returns that transition's current value, which at progress zero is the
 * repair itself (bot-found, Codex review round 2; confirmed directly
 * against real Chromium: a carrier with `transition: color 0.3s` read back
 * `rgb(158, 158, 158)`, this channel's own repair, where the authored
 * colour was `rgb(0, 0, 0)`, and read back `rgb(0, 0, 0)` correctly once
 * the freeze was in effect first). Sensing would otherwise call such a
 * carrier legible and drop its repair, leaving the transition to finish at
 * the illegible authored colour with no mutation left to schedule another
 * round — confirmed end to end against the real built extension, where the
 * carrier lost its tag outright after one reconcile round.
 *
 * The freeze is an author-origin `!important` rule on `*` (0-0-0), so a
 * vendor `transition: … !important` at any higher specificity outranks it
 * and the read is unreliable again for that carrier (bot-found, Codex
 * review round 3; confirmed directly — an inline
 * `transition: color 2s linear !important` kept `transitionDuration` at
 * `"2s"` under the freeze and read the repair back). That is the same
 * author-origin ceiling `foreground-repair.ts`'s own `repairCanWinCascade`
 * documents and #1410 tracks, not a separate gap: no amount of specificity
 * closes it, only a different injection origin does.
 *
 * `content.ts` already wraps the *initial* rescan in an equivalent freeze
 * (`withPrepaintSuppressed`) for the identical reason, but mutation-driven
 * rounds reach `fire()` without it. Applied here unconditionally rather
 * than only when a repair sheet exists: the freeze is what any
 * post-actuation colour read needs to be meaningful, and a conditional
 * would be more code for less correctness.
 */
function withRepairSuppressed<T>(fn: () => T): T {
  const el = document.getElementById(REPAIR_STYLE_ID)
  const sheet = el instanceof HTMLStyleElement ? el.sheet : null
  // Nothing of ours is applied, so nothing of ours can perturb a carrier —
  // and a freeze with nothing to protect against is pure collateral. The
  // first round of any page takes this path.
  if (sheet === null || sheet.disabled) return fn()

  const freeze = freezeSheet()
  if (freeze !== null) {
    freeze.disabled = false
    flushStyle()
  }
  try {
    sheet.disabled = true
    try {
      return fn()
    } finally {
      sheet.disabled = false
      // Re-enabling alone is not enough, and this flush is the point of
      // doing it *here*: a transition starts from whatever computed value
      // was last resolved, and the read above resolved the authored colour.
      // Without forcing a second resolve while transitions are still
      // frozen, the restored repair is only observed at the next rendering
      // opportunity — by which time the freeze is off again, so the engine
      // sees authored→repair as a fresh transitionable change and animates
      // it. Measured directly against the real built extension: the carrier
      // read back `rgb(18, 18, 18)` after a reconcile round, partway from
      // black to its `rgb(158, 158, 158)` repair, with the correct rule and
      // tag both in place the whole time. Resolving here commits the repair
      // while transitions are still off, so lifting the freeze changes
      // nothing and no frame is ever painted mid-flight.
      flushStyle()
    }
  } finally {
    if (freeze !== null) freeze.disabled = true
  }
}

/**
 * Forces the pending style recalculation to happen now. `getComputedStyle`
 * alone is lazy about nothing here — reading a property off it is what
 * actually resolves the element's style — so the property access is load-
 * bearing, not a stray expression.
 */
function flushStyle(): void {
  void getComputedStyle(document.documentElement).color
}

/**
 * Senses every in-domain, rendered carrier with its own explicit (not
 * inherited) foreground color — D-4's own amended audit boundary (SF-RC's
 * Gate 0 recon, F-18): a non-allowlisted descendant with no explicit color
 * of its own is already correctly covered by plain CSS inheritance from a
 * fixed co-located ancestor and must not be redundantly re-audited.
 * Deliberately does not exclude `[data-sw-patched]` the way `pipeline.ts`'s
 * own vendor-evidence Sensor does — that exclusion guards against feeding
 * this extension's own darkened *background* output back into the
 * append-only vendor hypothesis as fresh evidence (#831); this audit reads
 * *foreground* color against a *resolved* backdrop, a completely different
 * relation, so an already-tagged surface is exactly as valid a candidate as
 * an untouched one.
 *
 * An `IFRAME` is registered as its own `"underdetermined"`/`"underdetermined"`
 * diagnostic carrier rather than silently skip-listed (TSC-SF2, #1358; the
 * gap `docs/legibility-paint-grammar.md`'s own `PG-SCOPE-IFRAME-CONTENT` row
 * recorded as `unknown`): content actually rendered *inside* an iframe's own
 * document is a completely separate rendering context this audit cannot
 * see, with its own backdrop this element's own `resolveEffectiveBackdrop`
 * would not correctly describe either — both channels are unknown, not just
 * one. Deliberately does not traverse into `contentDocument` (same-origin or
 * not) to sense or theme what's inside — that would mean recursively
 * projecting this extension's own pipeline into every frame on the page,
 * which is a materially larger undertaking (`all_frames`-style theming) than
 * this diagnostic-only channel's own scope.
 */
export function auditLegibility(
  root: Element | ShadowRoot
): LegibilityScanResult {
  return withRepairSuppressed(() => senseLegibility(root))
}

function senseLegibility(root: Element | ShadowRoot): LegibilityScanResult {
  const elementsByKey = new Map<LegibilityKey, Array<Element>>()
  const attrsByKey = new Map<LegibilityKey, LegibilityAttr>()

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  let node: Node | null = walker.nextNode()

  while (node !== null) {
    if (isHTMLElementNode(node) && !isExtensionOwned(node)) {
      const style = getComputedStyle(node)
      if (isRendered(node, style)) {
        if (node.tagName === "IFRAME") {
          registerCandidate(
            node,
            { foreground: "underdetermined", backdrop: "underdetermined" },
            elementsByKey,
            attrsByKey
          )
        } else if (!SKIP_TAGS.has(node.tagName)) {
          const ownForeground = ownTextColor(node, style)
          const foreground = hasGeneratedPseudoHazard(node, style)
            ? "underdetermined"
            : ownForeground
          if (foreground !== null) {
            registerCandidate(
              node,
              { foreground, backdrop: resolveEffectiveBackdrop(node) },
              elementsByKey,
              attrsByKey
            )
          }
        }
      }
    }
    node = walker.nextNode()
  }

  return { elementsByKey, attrsByKey }
}

/**
 * `decide` for the legibility channel — pure, total, no DOM. Emits nothing
 * for a key that already clears `MIN_CONTRAST_RATIO`: an already-legible
 * carrier needs no diagnostic tag, which is what keeps an unchanged,
 * already-converged page's `realize` step a genuine zero-write no-op
 * (mirrors #831's own zero-churn fixed point for the first sub-pass).
 */
export function decideLegibility(
  attrsByKey: ReadonlyMap<LegibilityKey, LegibilityAttr>
): ReadonlyArray<TagLegibilityAction> {
  const actions: Array<TagLegibilityAction> = []

  for (const [key, attr] of attrsByKey) {
    if (
      attr.foreground === "underdetermined" ||
      attr.backdrop === "underdetermined"
    ) {
      actions.push({ kind: "tag-legibility", key, verdict: "underdetermined" })
      continue
    }

    if (violatesContrast(attr.foreground, attr.backdrop)) {
      actions.push({ kind: "tag-legibility", key, verdict: "violated" })
    }
  }

  return actions
}

/**
 * The channel's one contrast predicate, shared by `decideLegibility` above
 * and by SF-RC2's own `decideForegroundRepairs`/`repairedForeground`
 * (`foreground-repair.ts`) — a repair must be selected against exactly the
 * relation that flagged the violation in the first place, or the two can
 * disagree about whether a given carrier is settled and churn against each
 * other forever.
 *
 * A translucent own foreground (e.g. rgba(0,0,0,0.5)) does not render as
 * its own raw RGB channels — it renders as itself composited over the
 * resolved (already-opaque) backdrop, exactly like a background layer does
 * in `resolveEffectiveBackdrop` above (bot-found: rgba(0,0,0,0.5) over
 * white renders as mid-grey at ~4:1, not the 21:1 comparing raw black
 * against white would report).
 */
export function violatesContrast(foreground: RGBA, backdrop: RGBA): boolean {
  const renderedForeground = compositeOver(foreground, backdrop)
  const fgLuminance = relativeLuminance(
    renderedForeground[0],
    renderedForeground[1],
    renderedForeground[2]
  )
  const bgLuminance = relativeLuminance(backdrop[0], backdrop[1], backdrop[2])
  return contrastRatio(fgLuminance, bgLuminance) < MIN_CONTRAST_RATIO
}

/** The diagnostic-only attribute this channel writes — never a color, see this module's own header. */
export const LEGIBILITY_ATTR = "data-sw-legibility"

/**
 * Realizes `actions` against `root`'s own subtree: a diagnostic
 * `data-sw-legibility="violated"|"underdetermined"` attribute, guarded by
 * the same same-value check `actuator.ts`'s own `tagSurfaceElements` uses,
 * for the identical reason (#831: re-writing an unchanged value still
 * queues a mutation record) — and, just as importantly, *clearing* that
 * attribute from any previously-tagged element `actions` no longer names.
 *
 * `decideLegibility` emits nothing for a carrier that now passes (by
 * design — see its own doc comment), so a naive "only ever add" realize
 * left a stale `violated`/`underdetermined` tag on an element indefinitely
 * once the vendor's own later mutation made it legible again, or once it
 * stopped being an audited carrier at all (bot-found) — misleading
 * diagnostic data today, and a real hazard for SF-RC2's future tag-driven
 * repair channel, which would otherwise "fix" text that is already fine.
 * Scanning `root` for every currently-tagged element and dropping the
 * attribute from whichever this round's `actions` didn't just (re)assert
 * closes both cases the same way, regardless of *why* a given element
 * dropped out.
 */
/**
 * Drops every `data-sw-legibility` tag this channel wrote, document-wide.
 * See `foreground-repair.ts`'s own `clearForegroundRepairs` and
 * `pipeline.ts`'s `clearRealizedColorState` (this function's only caller)
 * for why leaving auto mode needs an explicit teardown rather than relying
 * on a final reconcile round.
 */
export function clearLegibilityTags(): void {
  document.querySelectorAll(`[${LEGIBILITY_ATTR}]`).forEach((el) => {
    el.removeAttribute(LEGIBILITY_ATTR)
  })
  // Safe to remove outright here, unlike during a round: no pipeline is left
  // observing, so there is nothing for the removal to feed back into.
  document.getElementById(FREEZE_STYLE_ID)?.remove()
}

export function realizeLegibility(
  root: Element | ShadowRoot,
  actions: ReadonlyArray<TagLegibilityAction>,
  elementsByKey: ReadonlyMap<LegibilityKey, ReadonlyArray<Element>>
): void {
  const keep = new Set<Element>()

  for (const action of actions) {
    for (const el of elementsByKey.get(action.key) ?? []) {
      keep.add(el)
      if (isHTMLElementNode(el) && el.dataset.swLegibility !== action.verdict) {
        el.dataset.swLegibility = action.verdict
      }
    }
  }

  root.querySelectorAll(`[${LEGIBILITY_ATTR}]`).forEach((el) => {
    if (!keep.has(el)) el.removeAttribute(LEGIBILITY_ATTR)
  })
}
