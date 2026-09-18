/**
 * The content-session pipeline — Sensor → Estimator → Scheduler, seamed
 * into the Adapter (`theme-adapter.ts`'s `decide`) and the Actuator
 * (`actuator.ts`'s `realize`). S5 of the some-filter-on-transport epic
 * (#685, #690): stands up `@some-extension/transport`'s stages in place of
 * `theme-apply.ts`'s old hand-rolled `patchObserver`/`patchAll`.
 *
 * Sensor: `scan()` walks the subtree exactly where `patchAll` used to
 * (skipping `[data-my-ext]` and the same media/script tags), reading each
 * element's computed background via `color.ts` — the one place in this
 * story that still calls `getComputedStyle` (Axiom D.1 scopes the DOM-free
 * requirement to `decide`, not to sensing). A `MutationObserver` with the
 * same `attributeFilter: ["class", "style"]` as before re-triggers it,
 * filtered by `isSelfAuthored` so the Actuator's own writes are never
 * mistaken for vendor evidence (Axiom 3.5), and every scan runs under
 * `withVendorColorsVisible` so what it reads is the vendor's page and not
 * the theme this pipeline painted on it.
 *
 * Estimator: one `update()` per *distinct* observed key per scan (Ĥ is
 * keyed by color, not by element — S1) using transport's own
 * `estimator/hypothesis` + `estimator/update`. `tier` is always `"full"`
 * (Definition 4.1): a background color is either read successfully in one
 * step or not read at all — there is no partial/multi-step extraction here
 * for `ξ` to stage.
 *
 * Scheduler: `RECONCILE_POLICY`/`BOUNDED_DELIVERY_MS` are Definition 7.2's
 * `R`, declared once here (§8.3's conformance requirement) — a burst of N
 * mutations inside the debounce window coalesces into exactly one
 * sense/`decide`/`realize` cycle, sensing included.
 */

import {
  parseColor,
  relativeLuminance,
  type RGBA,
} from "@filter/lib/content/color"
import type { ContrastSourceReport } from "@filter/lib/content/contrast-observability"
import { rgbaToCss } from "@filter/lib/content/modify-colors"
import { PREPAINT_DIRTY_CLASS } from "@filter/lib/content/prepaint"
import {
  DARK_THEME_ATTR,
  DARK_THEME_STYLE_ID,
} from "@filter/lib/content/theme-apply"
import { detectVendorInvert } from "@filter/lib/content/vendor-filter"
import { invoke } from "@some-extension/transport/adapter/invoke"
import { createHypothesis } from "@some-extension/transport/estimator/hypothesis"
import {
  createProvenanceStore,
  update,
  type ProvenanceStore,
} from "@some-extension/transport/estimator/update"
import {
  createCoalescer,
  type Coalescer,
  type ReconcilePolicy,
} from "@some-extension/transport/scheduler/reconcile"
import type { SessionLifecycle } from "@some-extension/transport/session/lifecycle"

import {
  clearPerSurfaceState,
  DYNAMIC_STYLE_ID,
  isHTMLElementNode,
  realize,
} from "./actuator"
import type { FilterAction, SurfaceAttr, SurfaceKey } from "./contracts"
import {
  clearForegroundRepairs,
  decideForegroundRepairs,
  realizeForegroundRepairs,
} from "./foreground-repair"
import { createHoverCancel } from "./hover-cancel"
import {
  auditContrastPairs,
  auditLegibility,
  clearLegibilityTags,
  decideLegibility,
  realizeLegibility,
  REPAIR_STYLE_ID,
  withDocumentTransitionsFrozen,
} from "./legibility-audit"
import {
  clearAllProvisional,
  clearProvisionalThrough,
  hasProvisionalMarks,
  markProvisional,
} from "./provisional"
import type { Swatch } from "./swatches"
import { decide } from "./theme-adapter"

/** Definition 7.2's `R`, declared once (§8.3's conformance requirement). */
export const RECONCILE_POLICY: ReconcilePolicy = { debounceMs: 50 }
export const BOUNDED_DELIVERY_MS = 250

/**
 * How long interaction has to stop before SF-RC4 (#1343) re-runs the
 * rendered-contrast channel.
 *
 * Deliberately its own constant rather than `RECONCILE_POLICY`'s 50ms, and
 * longer: a pointer crossing a page emits `pointerover`/`pointerout` per
 * element it enters and leaves, so this debounce is what turns a sweep
 * across fifty elements into one pass after the pointer settles — not fifty
 * passes, and not one every 50ms of continuous motion. `RECONCILE_POLICY`
 * governs a genuinely different thing (a burst of vendor *mutations*
 * collapsing into one round, Definition 7.2) and reusing its value here
 * would tie two unrelated cadences together.
 */
export const INTERACTION_SETTLE_MS = 120

/**
 * How far above the interaction target to root its settled-interaction
 * audit.
 *
 * This pass used to audit `document.body`, and that is the single most
 * expensive thing this extension did per unit of user input. Measured
 * against the real build on a 1500-row page: **8 long tasks totalling
 * 4617ms for twelve pointer pauses — ~600ms of blocked main thread every
 * time the pointer came to rest.** Identical on `origin/main`, so it is not
 * new, but it is what a "the extension is slowing down Firefox" notice is
 * made of on any page with a large DOM.
 *
 * The cost is not the walk. It is that `auditLegibility` resolves each
 * carrier's effective backdrop by climbing its ancestors and reads
 * pseudo-element styles per element, so it is superlinear in document size
 * and ~130µs per element rather than the ~1µs a plain `getComputedStyle`
 * costs.
 *
 * A hover changes computed style along the pointer's own ancestor chain and
 * whatever those ancestors' rules reach, so the affected region is local to
 * the interaction even when the selector that caused it is not. Rooting a
 * few levels up from the target covers the realistic shapes — a cell whose
 * row restyles, a label whose control restyles — at a cost bounded by that
 * subtree instead of the page.
 *
 * What this gives up, stated rather than glossed: a vendor rule of the form
 * `nav:hover .faraway-label`, where the restyled node is neither the target
 * nor near it, is no longer caught by the interaction pass. It is still
 * caught by any subsequent full round. That is a real reduction in
 * coverage, taken deliberately, because the alternative is a six-hundred
 * millisecond freeze every time the user stops moving the mouse.
 */
export const INTERACTION_AUDIT_DEPTH = 4

/**
 * The climb also stops at any ancestor with more than this many element
 * children.
 *
 * Depth alone is not a bound, and measurement is what showed it: rooting
 * four levels above a hovered cell took the audit from 4617ms to 2328ms and
 * no further, because four levels up from a cell in a long list is the
 * container holding *every* row. A fixed ancestor count says nothing about
 * how large that ancestor's subtree is, which is the quantity that actually
 * costs.
 *
 * `childElementCount` is O(1), so this stops the climb exactly where the
 * subtree stops being local — at the list, not at the row — without walking
 * anything to find out.
 */
export const INTERACTION_AUDIT_MAX_FANOUT = 32

/**
 * How long the settled-interaction audit may take before this page stops
 * getting one.
 *
 * Scoping the audit to the interaction's own neighbourhood took twelve
 * pointer pauses from 8 long tasks / 4617ms to 4 / 2358ms — real, and not
 * enough. A localised root is still only a *heuristic* bound: move the
 * pointer across a container rather than a row and the target is the
 * container, whose subtree is the page again. No DOM-shape heuristic fixes
 * that, because the quantity that costs is not a shape.
 *
 * So the pass measures itself. It runs once, and if that once exceeded the
 * budget it does not run again for this page — the full reconcile round
 * still covers everything this channel would have. The worst case becomes
 * one long task per page instead of one per time the user stops moving the
 * mouse, which is the difference between a slow extension and a browser
 * that appears hung.
 *
 * This is the first thing in this extension that bounds itself by *time*
 * rather than by rate, node count or DOM writes — the gap that let a
 * six-hundred-millisecond-per-pause freeze ship and stay shipped, on
 * `origin/main`, through every existing gate.
 *
 * 12ms is under one 60Hz frame. A page that cannot be audited inside a
 * frame is a page whose audit does not belong on the interaction path.
 */
export const INTERACTION_AUDIT_BUDGET_MS = 12

/**
 * The interaction events SF-RC4 (#1343) listens for, and the reason each is
 * the *bubbling* member of its pair.
 *
 * #1343 names `pointerenter`/`pointerleave`/`focus`/`blur`. None of those
 * four bubble, so a listener delegated on `document` never sees them — they
 * would need attaching to every carrier individually, and re-attaching
 * across every mutation. These are their bubbling counterparts, which is
 * what delegation requires.
 *
 * Covers `:hover` (`pointerover`/`pointerout`) and the `:focus`,
 * `:focus-visible` and `:focus-within` family (`focusin`/`focusout`) — with
 * one qualification on `:focus-visible` recorded in the gaps below, since
 * this list is the boundary statement #1343 asks for and an unqualified
 * claim there would be false.
 *
 * Known gaps, stated rather than glossed (#1343's own acceptance criterion
 * — this is emphatically not complete CSS-state coverage):
 *
 * - `:focus-visible` *modality* transitions on an already-focused element
 *   (bot-found, Codex review round 5; tracked in #1416). Focus an element
 *   by pointer and `:focus-visible` does not match; press a key without
 *   moving focus and it starts matching — the UA re-evaluates on keyboard
 *   input, and no `focusin` or `focusout` is emitted for it. Measured
 *   directly in Chromium: `:focus` true and `:focus-visible` false after
 *   the click, both true after a keypress, with the captured focus-event
 *   list identical across the two. So the element's initial focus is
 *   covered and a later modality flip is not, until some unrelated pointer
 *   or focus transition schedules a pass.
 * - `:active` — transient by nature; a repair would routinely land after
 *   release.
 * - `@keyframes` animations and transitions that change colour with no
 *   event at all.
 * - Media- and container-query state (viewport resize, `prefers-*` flips).
 * - `:target`, `:checked`, `:valid`/`:invalid` and other CSS-only state.
 * - Anything driven by a script mutating CSSOM directly, which produces no
 *   mutation record either (#1280's own lineage).
 */
const INTERACTION_EVENTS = [
  "pointerover",
  "pointerout",
  "focusin",
  "focusout",
] as const

/**
 * Passive, and on the **capture** phase.
 *
 * Capture because the bubble phase is suppressible by the page (bot-found,
 * Codex review round 4 on #1415). A component that handles its own
 * `pointerover`/`focusin` and calls `stopPropagation()` — routine in
 * dropdown, menu and modal widgets, which is exactly the third-party
 * component code this extension runs against — stops the event before it
 * reaches a delegated listener on `document`, and the interaction-state
 * colour change then goes unaudited with no error anywhere. A capture
 * listener on `document` runs on the way *down*, before any descendant
 * handler exists to call `stopPropagation()`, so no page code below the
 * document can suppress it.
 *
 * This is safe precisely because the handler only observes: it schedules a
 * timer and reads nothing from the event but `target`, so running earlier
 * changes nothing about what it computes. It does not call
 * `stopPropagation()` itself, so the page's own handlers still see every
 * event exactly as before — moving to capture takes coverage from the page
 * without taking anything from it.
 *
 * Passive because this handler never calls `preventDefault()`, so declaring
 * that up front lets the browser dispatch without waiting on it. The same
 * options object is passed to `removeEventListener`, where the `capture`
 * flag is the part that has to match for removal to find the listener.
 */
const INTERACTION_LISTENER: AddEventListenerOptions = {
  passive: true,
  capture: true,
}

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
  "IFRAME",
])

function shouldSkip(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true
  if (el.id === "__sw_overlay_root") return true
  if (el.hasAttribute("data-my-ext")) return true
  if (el.closest("[data-my-ext]")) return true
  // A "surface"-tagged element's live computed background is the
  // actuator's own hue-preserving darkened output (actuator.ts's
  // emit-surface-color rule targets it with !important, which always wins
  // over the vendor's original inline/stylesheet value) — never the
  // vendor's true color again, for as long as the tag stands. Reading it
  // back in as fresh evidence is pure self-feedback: the hypothesis (which
  // never forgets a key, by design — Ĥ is append-only) accumulates the
  // extension's own dark output as if it were new vendor signal, and
  // pageAlreadyDark()'s mean drifts down with every reactive rescan until
  // it eventually crosses the threshold and decide() emits restore-native
  // — the page "undoes its own theming" under nothing but its own churn,
  // with no vendor change involved at all. Excluding tagged elements from
  // classification breaks the loop at its source. (Elements tagged
  // "preserve" get `revert`ed, not overridden, so their computed style
  // already reflects the vendor's true color — but scan() has no cheap way
  // to distinguish the two tag values here, and re-including "preserve"
  // elements only forgoes reacting to a vendor recolor of an already
  // near-black surface, a narrow loss next to the runaway alternative.)
  if (el.hasAttribute("data-sw-patched")) return true
  return false
}

// Only recognized gradient functions — real `url(...)` photographic
// background-images are out of scope (#741 is specifically about gradients;
// there is no reliable way to assume a color for an arbitrary photo, and
// forcibly stripping one would be a much bigger, untested visual change).
const GRADIENT_RE = /(?:repeating-)?(?:linear|radial|conic)-gradient\(/i

/** Luminance 1 (pure white) — the same "unknown == probably light" bias `theme-detector.ts` already documents, applied here to a surface whose real color a `background-image` gradient hides from every sampler in this file. */
const ASSUMED_LIGHT_IMAGE: SurfaceAttr["color"] = [1, 1, 1, 1]

/**
 * A realm-independent replacement for `node instanceof ShadowRoot` — see
 * `shadow-actuator.ts`'s own `isHTMLElementNode`/`isElementNode` for the
 * identical reasoning applied to other node kinds: a host adopted from a
 * different realm (a same-origin iframe's own document, then moved in via
 * `appendChild()`/`adoptNode()`) keeps that *other* realm's `ShadowRoot`
 * constructor on its own shadow root's prototype chain, failing
 * `instanceof` against *this* realm's `ShadowRoot` even though it is
 * genuine and live. `nodeType` is a plain data property, not a prototype
 * check, so it survives that; `DOCUMENT_FRAGMENT_NODE` is what a
 * `ShadowRoot` (which extends `DocumentFragment`) carries, distinguishing
 * it from `scope-registry.ts`'s other `ScopeRef` member, `Document`
 * (`DOCUMENT_NODE`) — `shadow-scope-theming.ts`'s own `project()` uses this
 * exact distinction to recognize a scope's registered ref (bot-found, this
 * story's own review, round 3: without it, a cross-realm-adopted scope
 * stayed permanently `HELD`, its occlusion never released). Exported so
 * `shadow-scope-theming.ts` (which already imports `scan`/
 * `withVendorColorsVisible` from this module — no new import direction)
 * shares this one rather than keeping its own separate copy.
 */
export function isShadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === Node.DOCUMENT_FRAGMENT_NODE
}

/**
 * The element's own, non-inherited text color, or null when it has none of
 * its own (its computed `color` just matches its parent's — plain
 * inheritance, nothing for a surface-role recolor to re-target). `color` is
 * an inherited CSS property, so — unlike `background-color` — a matching
 * value doesn't mean "unset here," it means "not overridden here."
 *
 * `el.parentElement` is `null` for a *direct child of a `ShadowRoot`* — its
 * real parent (the root itself) is a `DocumentFragment`, not an `Element` —
 * which every element `scan()` ever visits inside the light DOM never hits
 * (`document.body`'s own descendants always have a real Element parent).
 * Falling straight through to "no own color" there discarded a genuinely
 * explicit foreground on exactly the shadow-scope elements most likely to
 * carry one (SF-AD's own review, round 4): a common
 * `<div style="background:white;color:#111">` sitting directly inside an
 * open shadow root darkened only its background, since `decide()` never
 * saw `textCss` evidence to also lift the text out of the dark it was now
 * sitting on. CSS's own inheritance model (the flat tree) says a shadow
 * root's direct children inherit from its *host* element, not from
 * nothing, so that is what an absent `parentElement` falls back to
 * comparing against here — the same comparison this function already makes
 * for every other element, just against the right ancestor.
 */
function ownTextColor(el: Element, style: CSSStyleDeclaration): RGBA | null {
  const parent = el.parentElement
  const parentNode = el.parentNode
  const inheritFrom =
    parent ??
    (parentNode !== null && isShadowRoot(parentNode) ? parentNode.host : null)
  if (inheritFrom === null) return null
  const inherited = getComputedStyle(inheritFrom).color
  if (style.color === inherited) return null
  return parseColor(style.color)
}

/** True unless the computed style itself proves the carrier was never actually painted. */
function isRendered(style: CSSStyleDeclaration): boolean {
  return style.display !== "none" && style.visibility !== "hidden"
}

function readAttr(el: Element): SurfaceAttr | null {
  const style = getComputedStyle(el)
  const rendered = isRendered(style)
  const c = parseColor(style.backgroundColor)

  if (c !== null) {
    return {
      color: c,
      luminance: relativeLuminance(c[0], c[1], c[2]),
      opacity: c[3],
      text: ownTextColor(el, style),
      rendered,
    }
  }

  // No explicit background-color, but a light gradient background-image is
  // just as capable of leaking a bright surface onto an otherwise-dark page
  // (#741) and is invisible to every other check here — treat it as
  // assumed-light evidence so it gets themed like any other surface.
  if (GRADIENT_RE.test(style.backgroundImage)) {
    return {
      color: ASSUMED_LIGHT_IMAGE,
      luminance: 1,
      opacity: 1,
      text: ownTextColor(el, style),
      imageOnly: true,
      rendered,
    }
  }

  return null
}

const CANVAS_KEY_HTML: SurfaceKey = "__canvas__:html"
const CANVAS_KEY_ROOT: SurfaceKey = "__canvas__:root"

type RawCarrierColor = {
  readonly color: RGBA | null
  readonly imageOnly: boolean
  readonly rendered: boolean
}

/** The raw, unresolved read of one carrier's own declared background — no propagation, no assumed-bright fallback. */
function readRawCarrierColor(el: Element): RawCarrierColor {
  const style = getComputedStyle(el)
  const rendered = isRendered(style)
  const color = parseColor(style.backgroundColor)
  if (color !== null) return { color, imageOnly: false, rendered }
  if (GRADIENT_RE.test(style.backgroundImage)) {
    return { color: ASSUMED_LIGHT_IMAGE, imageOnly: true, rendered }
  }
  return { color: null, imageOnly: false, rendered }
}

function canvasAttrFrom(raw: RawCarrierColor): SurfaceAttr {
  const color = raw.color ?? ASSUMED_LIGHT_IMAGE
  return {
    color,
    luminance: relativeLuminance(color[0], color[1], color[2]),
    opacity: raw.color === null ? 1 : color[3],
    rendered: raw.rendered,
    imageOnly: raw.imageOnly || raw.color === null,
    evidenceRole: "canvas",
  }
}

/**
 * True while prepaint.css's `html.sw-dirty > body { background-color: ...
 * !important }` backstop (that file's own header comment has the full
 * rationale) is forcing `body`'s computed background regardless of what the
 * vendor actually declared. `withVendorColorsVisible` below only suppresses
 * this extension's *theme* stylesheets (`OWN_COLOR_SHEET_IDS`) — the
 * backstop lives in prepaint.css, a separate, manifest-injected stylesheet
 * that also carries the veil element's own visible styling, so disabling
 * the whole sheet for the duration of a scan is not the safe, side-effect-free
 * option that disabling the two theme sheets is (a thrown scan before the
 * sheet is re-enabled would leave the veil itself unstyled, not just
 * untheme the page).
 *
 * `!important` plus this rule's `html.sw-dirty > body` specificity beats any
 * plain (non-`!important`) vendor `body` background — confirmed directly:
 * a vendor `body { background: white }` rule reads back through
 * `getComputedStyle` as this rule's own forced color while `sw-dirty` is
 * set, not the vendor's. That is the common case (most vendor CSS does not
 * mark its own background `!important`), and `sw-dirty` is active for the
 * *entire* first classification by design (the ADR: "classification runs
 * while the veil remains visible") — not just during a repair path.
 */
function bodyCanvasBackstopActive(): boolean {
  return document.documentElement.classList.contains(PREPAINT_DIRTY_CLASS)
}

/**
 * Resolves `html`'s effective canvas evidence — the substrate a fully
 * transparent light-DOM stack leaves showing through as the browser's own
 * white default paint. This is *not* simply `html`'s own declared
 * background: CSS's canvas background propagation
 * (https://www.w3.org/TR/css-backgrounds-3/#special-backgrounds) means
 * that when `html` declares no background of its own, the UA instead
 * paints `body`'s declared background across the *entire* canvas — a real,
 * extremely common native-dark pattern (`body { background: #000 }` with
 * `html` left untouched) that reading `html` and `body` as two
 * independently-transparent, independently-assumed-bright carriers would
 * misclassify as bright and veto `restore-native` on every such page.
 * Falling through to `body` here, and only treating the pair as truly
 * unknown when *neither* declares anything, is what makes this that same
 * "unknown means light" bias `readAttr` already applies to a gradient-only
 * surface — generalized to "no resolvable color anywhere the canvas could
 * get one from," not to "this one element's read came back empty."
 *
 * Returns `null` — no evidence, not "confidently bright" and not
 * "confidently dark" — when the fallback-to-`body` read would be taken
 * while `bodyCanvasBackstopActive()`. That is a deliberately weaker
 * response than marking the attr `rendered: false`: `pageAlreadyDark()`'s
 * canvas branch treats *any* untrustworthy canvas evidence as a veto
 * ("unknown never earns restore-native", Requirement 3) — correct for a
 * carrier that is genuinely hidden or too transparent to read, where
 * *something* about it is still known. A backstop-contaminated read carries
 * no information about the vendor's color in either direction; folding it
 * into the same veto path would force "not already dark" for the *entire*
 * first classification on any page where `html` itself declares no
 * background (the common case), silently disabling already-dark detection
 * on initial load rather than merely losing #1257's extra protection for
 * this one evidence source on this one round. Omitting the key instead
 * means `ingest()`'s `update()` call is simply skipped for it this round —
 * the hypothesis is append-only, so a prior, uncontaminated reading (if
 * any) is left standing rather than overwritten with a value this read
 * cannot actually support.
 */
function readHtmlCanvasAttr(): SurfaceAttr | null {
  const html = readRawCarrierColor(document.documentElement)
  if (html.color !== null) return canvasAttrFrom(html)

  if (bodyCanvasBackstopActive()) return null

  const body = readRawCarrierColor(document.body)
  return canvasAttrFrom(body)
}

/**
 * Samples `html` (propagation-resolved against `body`, see
 * `readHtmlCanvasAttr`) and, when it differs from both, `root` itself, for
 * `theme-adapter.ts`'s bright-canvas veto (Phase 1 of the false-dark-verdict
 * fix). Deliberately disjoint from `scan()`'s descendant-only
 * `elementsByKey`/`attrsByKey` — these keys name no real element for
 * `realize()`'s per-surface tagging to act on, and `decide()` never emits a
 * tag-surface/emit-surface-color action for an `evidenceRole: "canvas"`
 * key, so keeping them out of `elementsByKey` costs nothing and keeps
 * `scan()`'s own "never classifies root itself" contract intact for its
 * existing callers.
 */
export function scanCanvas(
  root: Element
): ReadonlyMap<SurfaceKey, SurfaceAttr> {
  const attrs = new Map<SurfaceKey, SurfaceAttr>()
  const htmlAttr = readHtmlCanvasAttr()
  if (htmlAttr !== null) attrs.set(CANVAS_KEY_HTML, htmlAttr)
  if (root !== document.body && root !== document.documentElement) {
    attrs.set(CANVAS_KEY_ROOT, canvasAttrFrom(readRawCarrierColor(root)))
  }
  return attrs
}

// ── Vendor truth (Axiom 3.5, read side) ──────────────────────────────────────

/** The two sheets that carry *our* colors; everything else in the page is vendor. */
const OWN_COLOR_SHEET_IDS: ReadonlyArray<string> = [
  DARK_THEME_STYLE_ID,
  DYNAMIC_STYLE_ID,
  // SF-RC2 (#1341): the legibility channel's own foreground repair sheet is
  // just as much "our colors" as the two above. Left out, `scan()`'s own
  // ownTextColor read would fold this extension's repaired foregrounds back
  // into the append-only vendor hypothesis as fresh `textCss` evidence —
  // #831's symptom 2 exactly, one channel over, and self-sustaining in the
  // same way (each round's repair becomes the next round's "vendor" text
  // color).
  REPAIR_STYLE_ID,
]

/**
 * Runs `fn` with this extension's own color sheets disabled, so every
 * `getComputedStyle` inside it reads the *vendor's* background rather than
 * the theme we painted over it.
 *
 * `shouldSkip`'s `[data-sw-patched]` exclusion covers only the surfaces the
 * Actuator tagged. The static layer (`buildDarkThemeCSS`) recolors far more
 * than that — `html`/`body`, `th`, `pre`, `code`, `input`, `textarea`,
 * `select`, `dialog`, `[popover]`, and the ARIA popup roles (`menu`,
 * `listbox`, `dialog`, `alertdialog`, `tooltip`) — with `!important` rules
 * keyed on element type or role, and none of those carriers are tagged. Their post-activation computed
 * background is our swatch, and the hypothesis is append-only, so every
 * reactive rescan folded more of our own dark output back in as if it were
 * fresh vendor evidence until `pageAlreadyDark()`'s mean crossed the
 * threshold and `decide()` emitted `restore-native` — the theme undoing
 * itself with no vendor change involved (#831, symptom 2).
 *
 * Disabling via `CSSStyleSheet.disabled` rather than detaching the elements
 * is what makes this safe to do on the hot path: it mutates no DOM (so it
 * queues no MutationRecord to react to) and, because the whole scan is one
 * synchronous task, no frame is ever painted with the theme off.
 */
export function withVendorColorsVisible<T>(fn: () => T): T {
  // Frozen *outside* the suppression, deliberately. Disabling a colour
  // sheet is itself a style change, so on any element carrying an authored
  // `transition` the read below returns the transition's start value —
  // which is whatever this extension last painted there. A freeze declared
  // inside one of the suppressed sheets cannot close that, because it goes
  // away in the same instant the colour does; see `FREEZE_RULE`'s own doc
  // comment, where `provisional.ts`'s fill is the case that made it live.
  //
  // Conditional, and the condition matters more than it looks. The freeze
  // costs two further forced style flushes on top of the two this function
  // already pays, i.e. it doubles the cost of the single most expensive
  // thing on the sensing path. Before the provisional fill existed this
  // function had no freeze and needed none — `[data-sw-patched]` is a
  // latent version of the same hazard, but one no test has ever caught and
  // one that predates this branch by a long way. So the cost is paid only
  // on rounds where a provisional mark actually exists, which is precisely
  // the case that made it necessary; a steady page pays exactly what it
  // paid before. `querySelector` stops at the first match.
  if (!hasProvisionalMarks()) {
    return suppressOwnColorSheets(fn)
  }
  return withDocumentTransitionsFrozen(() => suppressOwnColorSheets(fn))
}

function suppressOwnColorSheets<T>(fn: () => T): T {
  const suppressed: Array<CSSStyleSheet> = []

  for (const id of OWN_COLOR_SHEET_IDS) {
    const el = document.getElementById(id)
    const sheet = el instanceof HTMLStyleElement ? el.sheet : null
    if (sheet !== null && !sheet.disabled) {
      sheet.disabled = true
      suppressed.push(sheet)
    }
  }

  try {
    return fn()
  } finally {
    for (const sheet of suppressed) {
      sheet.disabled = false
    }
  }
}

/**
 * Drops every colour artifact this extension's auto-mode realization owns in
 * the document scope: the per-surface `<style>` and its `data-sw-patched`
 * tags, the legibility channel's `data-sw-legibility` diagnostics, and the
 * foreground repair sheet with its `data-sw-legibility-fix` tags.
 *
 * `theme-apply.ts`'s own `restoreVendor()` is documented as removing "all
 * theming", but it only ever knew about the two layers that predate the
 * adapter: it drops `data-sw-dark` and the static `__sw_dark_theme` sheet,
 * and nothing else. Everything the per-surface Actuator realizes has, until
 * now, survived a mode exit outright.
 *
 * That gap is not reachable from inside the pipeline, which is why it went
 * unnoticed: `realize()`'s own `restore-native` branch clears per-surface
 * state, and `fire()`'s no-`activate-theme` branch clears both legibility
 * channels, but leaving auto mode reaches neither — `content.ts`'s
 * `applyState` calls `contentSession.teardown()` (which only disconnects the
 * observer) *before* `restoreVendor()`, so no further round ever runs. Found
 * by a bot review of the repair sheet specifically (Codex review round 1);
 * confirmed by direct measurement against the real built extension that the
 * pre-existing per-surface half leaks identically and more visibly — after
 * an auto→off keyboard cycle a themed card still rendered
 * `background-color: rgb(23, 23, 23)`, i.e. the page stayed dark with the
 * extension switched off. `tests/e2e/specs/issue-1341-sfrc2-foreground-repair.spec.ts`
 * regression-locks the whole transition, not just this story's own half:
 * splitting one artifact out of a "common mode-transition cleanup path"
 * while knowingly leaving its siblings behind would make the path a fiction.
 *
 * Document scope only. A committed shadow scope's own realization is
 * `shadow-scope-theming.ts`'s `teardown()`, which `applyState` already calls
 * alongside this.
 */
export function clearRealizedColorState(): void {
  clearPerSurfaceState()
  clearAllProvisional()
  clearLegibilityTags()
  clearForegroundRepairs()
}

// ── Self-authored mutations (Axiom 3.5, write side) ──────────────────────────

function isExtensionAuthored(node: Node): boolean {
  const el = node instanceof Element ? node : node.parentElement
  if (el === null) return false
  return el.hasAttribute("data-my-ext") || el.closest("[data-my-ext]") !== null
}

/**
 * The prepaint veil's ownership signal is the one extension write that
 * lands on a *vendor* node (`sw-dirty` on `<html>`), so it cannot be
 * recognised by target — only by what changed. Compares the record's
 * `oldValue` against the live class list and reports whether the veil class
 * is the *only* difference.
 */
function isDirtyClassToggle(record: MutationRecord): boolean {
  if (record.attributeName !== "class") return false
  if (record.target !== document.documentElement) return false

  const before = new Set(
    (record.oldValue ?? "").split(/\s+/).filter((token) => token.length > 0)
  )
  const after = new Set(document.documentElement.classList)

  before.delete(PREPAINT_DIRTY_CLASS)
  after.delete(PREPAINT_DIRTY_CLASS)

  if (before.size !== after.size) return false
  for (const token of before) {
    if (!after.has(token)) return false
  }
  return true
}

/**
 * Axiom 3.5 (Actuator re-entrance): true when this record is our own
 * actuation echoing back, not vendor evidence. Defense in depth alongside
 * the write guards in `actuator.ts`/`prepaint.ts` — those keep an unchanged
 * round from emitting records at all; this keeps the records a *changed*
 * round legitimately emits from being mistaken for a reason to run again.
 */
export function isSelfAuthored(record: MutationRecord): boolean {
  if (isExtensionAuthored(record.target)) return true

  if (record.type === "childList") {
    // Removal of an extension-owned node is deliberately *not* treated as
    // self-authored, even though this module is one of the things that
    // removes them. Remark 7.2's whole point is that "our node is gone" is
    // ambiguous between "we took it down" and "the vendor did" — and the
    // second case is the one that must be repaired, so the ambiguity has to
    // resolve toward reacting. Reacting to our own teardown costs exactly
    // one extra round and cannot loop: the round that follows re-derives
    // the same verdict and, finding nothing left to remove, writes nothing.
    if (record.removedNodes.length > 0) return false

    const added = [...record.addedNodes]
    return added.length > 0 && added.every(isExtensionAuthored)
  }

  return isDirtyClassToggle(record)
}

export type ScanResult = {
  readonly elementsByKey: ReadonlyMap<SurfaceKey, ReadonlyArray<Element>>
  readonly attrsByKey: ReadonlyMap<SurfaceKey, SurfaceAttr>
}

/**
 * The dedup key for a scanned element's evidence. Normally just its
 * canonical background color (S1's original design — "one hypothesis per
 * observed background"). Two refinements fold additional attributes into
 * the key, both guarding the same failure mode: `elementsByKey`/`attrsByKey`
 * only ever record the *first* element seen for a given key (`scan()`
 * below) — every later element sharing that key is tagged identically but
 * never gets to contribute its own evidence.
 *
 *   - Own text color: an element sharing a light ancestor's exact
 *     background (`<main style="background-color: white">` wrapping
 *     `<div id="card" style="background-color: white; color: #141414">` is
 *     an ordinary vendor pattern, not a contrived one) collapses onto
 *     whichever of the two `scan()`'s TreeWalker visits *first* — always
 *     the ancestor, which has no `color` of its own — permanently
 *     discarding the descendant's own text color from the hypothesis
 *     (#741's "it darkens text so that it's not visible at all": the
 *     per-surface foreground fix in `theme-adapter.ts`'s `decide()` never
 *     even sees the evidence needed to apply it).
 *   - `imageOnly`: an assumed-light gradient carrier can coincidentally
 *     share its assumed color's canonical string with a real, same-colored
 *     `background-color` elsewhere on the page (#741's "white gradients
 *     leak" fixture is exactly this — a white `<main>` ancestor, and a
 *     transparent-bg `<div>` whose only color evidence is a white
 *     gradient) — without a distinct key, the real background-color
 *     element's (correct, non-suppressing) attr wins and the gradient
 *     carrier's own `background-image` is never actually suppressed.
 *
 * Both refinements give same-bg-but-differently-evidenced carriers distinct
 * keys, each with its own tag and dynamic rule, instead of silently sharing
 * whichever arrived first.
 */
function surfaceKeyFor(attr: SurfaceAttr): SurfaceKey {
  const bgKey =
    attr.imageOnly === true
      ? `image:${rgbaToCss(attr.color)}`
      : rgbaToCss(attr.color)
  if (attr.text === undefined || attr.text === null) return bgKey
  return `${bgKey}|text:${rgbaToCss(attr.text)}`
}

/**
 * Walks `root`'s descendants (never `root` itself — matches `patchAll`'s old
 * scope; `root`'s own canvas is the static layer's job). `root` accepts a
 * `ShadowRoot` as well as an `Element` — SF-AD (#1268) calls this scoped to
 * a shadow scope's own root, reusing this function unchanged (Definition
 * D.3's boundary already makes it scope-agnostic): `document.createTreeWalker`
 * accepts any `Node`, and every other read in this function only ever
 * touches the *walked* nodes, which `NodeFilter.SHOW_ELEMENT` guarantees are
 * always `Element`s regardless of what kind of node `root` itself is. Uses
 * `actuator.ts`'s `isHTMLElementNode`, not `node instanceof HTMLElement`,
 * for the identical reason that module's own doc comment gives: a
 * cross-realm-adopted element inside a shadow scope was latent (this
 * function never ran inside one at all, pre-SF-AD) until this story's own
 * review made it live (round 3).
 */
export function scan(root: Element | ShadowRoot): ScanResult {
  const elementsByKey = new Map<SurfaceKey, Array<Element>>()
  const attrsByKey = new Map<SurfaceKey, SurfaceAttr>()

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  let node: Node | null = walker.nextNode()

  while (node !== null) {
    if (isHTMLElementNode(node) && !shouldSkip(node)) {
      const attr = readAttr(node)
      if (attr !== null) {
        const key = surfaceKeyFor(attr)
        const list = elementsByKey.get(key)
        if (list !== undefined) {
          list.push(node)
          // Only the first carrier's attr is retained as the key's
          // representative evidence (color/text below), but `rendered`
          // must not inherit that same "first wins" collapse: a later
          // occurrence of an identical color that IS actually on screen
          // must not be discarded from the page-level mean just because
          // the first occurrence happened to be hidden/zero-area. `rendered`
          // is true for the key as a whole whenever *any* carrier sharing
          // it is rendered.
          if (attr.rendered === true) {
            const existing = attrsByKey.get(key)
            if (existing !== undefined && existing.rendered !== true) {
              attrsByKey.set(key, { ...existing, rendered: true })
            }
          }
        } else {
          elementsByKey.set(key, [node])
          attrsByKey.set(key, attr)
        }
      }
    }
    node = walker.nextNode()
  }

  return { elementsByKey, attrsByKey }
}

export type ContentSession = {
  /** Full re-scan + one coalesced decide/realize cycle. Safe to call repeatedly — the SPA re-patch path (`yt-navigate-finish`) is just another call. */
  rescan(root?: Element): void
  /** Attaches the Sensor's MutationObserver over `document.documentElement` (survives body/head replacement). Idempotent. */
  observe(): void
  /** Disconnects the observer and cancels any pending coalesced invocation. */
  teardown(): void
}

/**
 * `fire()`'s per-round result. Distinguishes a genuine decide()/realize()
 * outcome (`"ok"`, possibly an empty/no-op actions array — swatch null, or
 * a `restore-native` verdict) from a thrown round (`"error"`) — collapsing
 * both into "no actions" was #1266's own fail-open gap (`content.ts`'s onFire
 * could not tell "nothing to do" from "something broke"; both look like
 * `applied === false`, and both took the same immediate `disablePrepaint()`
 * branch instead of holding the veil on the latter).
 */
export type FireOutcome =
  | {
      readonly kind: "ok"
      readonly actions: ReadonlyArray<FilterAction>
      /**
       * Whether `realize()` actually wrote to the DOM this round — a tag
       * changed, the dynamic sheet's text changed, or the theme attribute
       * flipped. `content.ts` gates its shadow-scope re-contrast pass on
       * this (SF-RC3, #1342, bot-found): a shadow carrier's backdrop can
       * resolve out into the light DOM, so it goes stale exactly when the
       * document *writes*, which is not the same as when it *decides* —
       * an element matching a `SurfaceKey` the page already has emits no
       * new action at all and is still tagged and darkened.
       */
      readonly realizationChanged: boolean
    }
  | { readonly kind: "error"; readonly error: unknown }

export type OnFire = (outcome: FireOutcome) => void

export function createContentSession(
  swatch: Swatch | null,
  session: SessionLifecycle,
  onFire?: OnFire,
  /**
   * Called once interaction has settled, after this module's own
   * document-scope contrast pass — the seam SF-RC4 (#1343) needs to reach
   * shadow scopes (bot-found, Codex review round 1 on #1415).
   *
   * `auditLegibility`'s `TreeWalker` does not cross a shadow boundary, so
   * the pass above covers the light DOM and nothing else. The shadow half
   * lives in `shadow-scope-theming.ts` and is reached through
   * `content.ts`, the one place that holds both — which is why this is a
   * callback rather than an import: `pipeline.ts` has no business knowing
   * the scope registry exists, and SF-SCOPE's Theorem D.2 keeps it that
   * way deliberately.
   *
   * Invoked regardless of whether the document half ran: a shadow scope's
   * verdict is independent of the document's.
   */
  onInteractionSettled?: () => void,
  /**
   * SF-RC5 (#1344): called with a fresh, uncapped `ContrastAudit` — every
   * `(foreground, backdrop)` pair this round actually scanned, not just the
   * failing ones — every time `runContrastChannel` runs (a full round's own
   * pass, and SF-RC4's interaction-settled re-run alike), and,
   * symmetrically, with an empty one whenever this round applied no theme
   * at all, so a stale violated pair from a *prior* themed round does not
   * linger once the page reads as already-dark. Called with `null` — not an
   * empty audit — when a round's own scan/repair throws before reaching
   * this call: `null` means "this round's own state is unknown," an empty
   * array means "this round genuinely audited nothing," and conflating them
   * let a failed round read as confidently clean (bot-found, Codex
   * confirming review round 3 on #1443) — see `ContrastSourceReport`'s own
   * doc comment. content.ts merges this with every shadow scope's own audit
   * (`shadow-scope-theming.ts`'s own `onContrastAudited`) via
   * `mergeContrastAudits()` before persisting the second, independent
   * `"contrast"` snapshot — never folded into `coverageWatchdog`'s own
   * `"coverage"` one (see `contrast-observability.ts`'s own header for why).
   */
  onContrastAudited?: (audit: ContrastSourceReport) => void
): ContentSession {
  const hypothesis = createHypothesis<SurfaceKey, SurfaceAttr>()
  const provenance: ProvenanceStore<SurfaceKey> = createProvenanceStore()
  let lastScan: ScanResult = { elementsByKey: new Map(), attrsByKey: new Map() }
  let lastRoot: Element = document.body
  let observer: MutationObserver | null = null
  let interactionTimer: ReturnType<typeof setTimeout> | null = null
  let evidenceEpoch = session.epoch
  /** The element the most recent interaction event targeted. */
  let lastInteractionTarget: HTMLElement | null = null
  /**
   * Set once the settled-interaction audit has overrun its budget on this
   * page. Cleared on an epoch change, since a route swap can replace the
   * document with one this channel can afford.
   */
  let interactionAuditOverBudget = false

  /**
   * Monotonic stamp written onto every provisionally-darkened subtree root,
   * and the boundary a round uses to clear exactly the marks that already
   * existed when it sensed.
   *
   * Incremented at the start of each round rather than per mark: the value
   * needs to separate "marked before this round looked" from "marked while
   * this round was running", and nothing finer. See
   * `provisional.ts`'s `clearProvisionalThrough`.
   */
  let provisionalGeneration = 0

  /**
   * Theorem D.1(a): a content reset means the page under us was replaced.
   * `update()`'s epoch dominance already keeps stale evidence from *winning*
   * a key that recurs, but Ĥ never forgets a key outright, so keys the new
   * page does not carry at all would otherwise keep voting in
   * `pageAlreadyDark()`'s mean forever — the previous route's colors
   * deciding the current route's verdict.
   */
  function dropStaleEvidence(): void {
    for (const key of [...hypothesis.keys()]) {
      hypothesis.delete(key)
    }
    provenance.clear()
  }

  function ingest(root: Element): void {
    try {
      if (session.epoch !== evidenceEpoch) {
        evidenceEpoch = session.epoch
        // A route swap can replace a document this channel could not afford
        // with one it can; the latch is about a page, not a session.
        interactionAuditOverBudget = false
        dropStaleEvidence()
      }

      const { scanned, canvas } = withVendorColorsVisible(() => ({
        scanned: scan(root),
        canvas: scanCanvas(root),
      }))
      lastScan = scanned
      lastRoot = root
      const timestamp = Date.now()
      for (const [key, attrs] of lastScan.attrsByKey) {
        update(hypothesis, provenance, {
          key,
          attrs,
          epoch: session.epoch,
          tier: "full",
          timestamp,
        })
      }
      for (const [key, attrs] of canvas) {
        update(hypothesis, provenance, {
          key,
          attrs,
          epoch: session.epoch,
          tier: "full",
          timestamp,
        })
      }
    } catch (error) {
      // Both call sites (rescan(), the MutationObserver callback) are
      // synchronous and neither is itself wrapped by the caller — an
      // uncaught throw here would abort whatever synchronous call chain
      // invoked it (withPrepaintSuppressed() in content.ts included) before
      // coalescer.trigger() below ever runs, silently holding the page
      // under the veil forever with the failure visible nowhere. Still call
      // trigger() on the partial/stale hypothesis so fire()'s own try/catch
      // gets a chance to settle *something* rather than nothing at all.
      // eslint-disable-next-line no-console
      console.error("[some-filter] pipeline ingest() failed:", error)
    }
  }

  /**
   * SF-RC1 (#1340)'s second, independent sense/decide/realize sub-pass —
   * see `legibility-audit.ts`'s own header for the isolation this relies
   * on. Extracted from `fire()` for SF-RC4 (#1343), which re-runs exactly
   * this and nothing else after an interaction settles: a `:hover` colour
   * swap changes no DOM and produces no action, so a full round would
   * re-derive an identical verdict at the cost of a second whole-document
   * `scan()`.
   *
   * `legibilityActions` is never merged into (or derived from) `decide()`'s
   * actions — `pageAlreadyDark()`/`decide()` never see this channel's
   * evidence, by construction rather than by a runtime check.
   *
   * SF-RC2 (#1341)'s repair alphabet is decided from the *same* scan, never
   * a second sense pass that could disagree with the diagnostic tags written
   * a line above, and realized into its own sheet as a deliberately separate
   * action set — see `foreground-repair.ts`'s own header. SF-RC3 (#1342)
   * threads the vendor-invert compensation through the document half too,
   * from the same `detectVendorInvert()` read `injectDarkTheme()` already
   * does per round and for the same reason: a vendor's own invert toggle can
   * flip at any point in a page's lifetime, so it is never cached.
   */
  function runContrastChannel(root: Element): void {
    const legibilityScan = auditLegibility(root)
    const legibilityActions = decideLegibility(legibilityScan.attrsByKey)
    realizeLegibility(root, legibilityActions, legibilityScan.elementsByKey)
    realizeForegroundRepairs(
      root,
      decideForegroundRepairs(legibilityScan.attrsByKey),
      legibilityScan.elementsByKey,
      detectVendorInvert()
    )
    onContrastAudited?.(auditContrastPairs(legibilityScan, legibilityActions))
  }

  function fire(): void {
    let outcome: FireOutcome
    try {
      const actions = invoke(hypothesis, { decide: (h) => decide(h, swatch) })
      const realizationChanged = realize(actions, lastScan.elementsByKey)

      // SF-RC1 (#1340): the second, independent sense/decide/realize
      // sub-pass — see legibility-audit.ts's own header for the isolation
      // this relies on. Gated on activate-theme actually being present:
      // with no theme applied (no swatch, or pageAlreadyDark()'s own
      // restore-native) there is nothing this extension painted to audit.
      // legibilityActions is never merged into (or derived from) `actions`
      // above — pageAlreadyDark()/decide() never see this channel's
      // evidence, by construction, not by a runtime check. A throw
      // anywhere in this block is caught by this same try/catch, exactly
      // like a thrown decide()/realize() above — #1266's FAILED_HELD
      // discipline applies unchanged to this channel, not re-derived.
      if (actions.some((action) => action.kind === "activate-theme")) {
        runContrastChannel(lastRoot)
      } else {
        // No theme applied this round (no swatch, or pageAlreadyDark()'s own
        // restore-native) — nothing to audit, but a *prior* round may have
        // left data-sw-legibility tags behind from when the page was still
        // themed (bot-found: realize()'s own restoreVendor()/
        // clearPerSurfaceState() strips data-sw-patched but has no idea this
        // channel's own attribute exists). An empty action set reuses
        // realizeLegibility's own stale-tag clearing (see its doc comment)
        // rather than a second, special-cased cleanup path — to that
        // function, "no violations exist" is exactly what this already
        // means.
        realizeLegibility(lastRoot, [], new Map())
        realizeForegroundRepairs(lastRoot, [], new Map())
        // Nothing was audited this round either — report an empty audit
        // explicitly rather than leaving a themed round's stale
        // violated/underdetermined pairs standing once the page reads as
        // already-dark or otherwise applies no theme at all.
        onContrastAudited?.([])
      }

      outcome = { kind: "ok", actions, realizationChanged }
    } catch (error) {
      // onFire must run regardless — content.ts uses it to set the debug
      // attrs a live-browser wait (or a e2e test) polls for and to resolve
      // the veil (commitVisualState/disablePrepaint, now routed through
      // document-scope.ts's registry custodian). A thrown decide/realize
      // left this callback un-run entirely, holding the page under the veil
      // forever with the failure visible nowhere but here — reported as
      // `"error"` rather than a bare empty actions array so the caller can
      // tell it apart from a genuine "nothing to do" verdict (#1266).
      // eslint-disable-next-line no-console
      console.error("[some-filter] pipeline fire() failed:", error)
      outcome = { kind: "error", error }
      // Bot-found (Codex confirming review on #1443, the ordinary-round
      // counterpart to runInteractionContrast's own catch above): a throw
      // from invoke()/realize() or from runContrastChannel() itself, both
      // above, means onContrastAudited never ran for this round at all — the
      // *previous* round's document audit would otherwise stand in as
      // current indefinitely. content.ts's reportPipelineOutcome(outcome)
      // moves the document scope to FAILED_HELD on this same "error" outcome,
      // but that transition only reaches shadowContrastByScope (this scope
      // registry's own shared eviction switch does not know documentContrast
      // exists at all — pipeline.ts's own boundary, by design); only this
      // catch is positioned to invalidate the document half. Reports `null`,
      // not `[]` — see runInteractionContrast's own catch and
      // ContrastSourceReport's own doc comment for why the two are not
      // interchangeable (bot-found, Codex confirming review round 3).
      onContrastAudited?.(null)
    }
    onFire?.(outcome)
  }

  /**
   * The leading edge, in its entirety: stamp each root the vendor just
   * inserted so the static layer fills it dark, and return.
   *
   * No style read, therefore no forced recalc, therefore nothing to budget
   * and nothing to bail out of. `provisional.ts`'s header carries the
   * measurement that made the previous read-based design untenable — the
   * reads were ~1 µs/element and the suppression around them ~6 ms of
   * full-document recalc, per batch.
   *
   * Runs inside the observer callback, which is a microtask, so the
   * attribute is set before the frame the subtree was created in performs
   * its rendering steps. The browser was already going to recalc style for
   * a subtree that was just inserted; this adds one attribute to that work
   * rather than forcing a second, separate pass over the whole document.
   */
  function markAddedSubtrees(records: ReadonlyArray<MutationRecord>): void {
    try {
      markProvisional(records, provisionalGeneration + 1)
    } catch (error) {
      // Same discipline as ingest()'s own catch, and load-bearing for the
      // same reason: this runs in the observer callback, so an uncaught
      // throw would take coalescer.trigger() below with it and the page
      // would stop reacting to the vendor entirely.
      // eslint-disable-next-line no-console
      console.error("[some-filter] pipeline provisional marking failed:", error)
    }
  }

  /**
   * One full round: sense, then decide/realize on what was sensed, then
   * lift the provisional fill from everything that was already marked when
   * sensing began.
   *
   * The generation is bumped *before* `ingest()` and cleared *through* that
   * same value after `fire()`, which is what makes the handover safe in
   * both directions. A subtree marked before this round was scanned by it,
   * so the round's verdict (a tag, or the considered absence of one) has
   * superseded the fill and the mark can go. A subtree inserted while the
   * round was running carries the *next* generation, was never sensed, and
   * keeps its fill until the round that does sense it — without that split
   * there is a window between `scan()` and here in which a fresh subtree
   * loses its fill having never been classified, which is the one path by
   * which this mechanism could still put a light surface on screen.
   *
   * Clearing after `fire()`, never before: until the Actuator has written,
   * the fill is the only thing standing between the vendor's colours and
   * the glass.
   */
  function cycle(root: Element): void {
    provisionalGeneration += 1
    const sensedThrough = provisionalGeneration
    ingest(root)
    fire()
    try {
      clearProvisionalThrough(sensedThrough)
    } catch (error) {
      // Never fatal: a stale mark leaves a subtree dark, which is the safe
      // direction by construction, and the next round clears it anyway.
      // eslint-disable-next-line no-console
      console.error("[some-filter] pipeline provisional clear failed:", error)
    }
  }

  // The coalesced round senses *inside* the debounce window, not before it.
  // Scanning per raw mutation batch (as this used to) made the Sensor's cost
  // scale with the vendor's churn rate rather than with the reconcile
  // policy: a page mutating steadily paid a full O(nodes) tree walk plus a
  // getComputedStyle per node for every batch, and threw away all but the
  // last result when the single coalesced fire finally ran (#831, symptom
  // 3). Definition 7.2's whole point is that a burst of N mutations costs
  // one round — sensing included.
  const coalescer: Coalescer = createCoalescer(RECONCILE_POLICY, () => {
    cycle(document.body)
  })

  /**
   * SF-RC4 (#1343): re-run the rendered-contrast channel once interaction
   * has settled.
   *
   * A `:hover`/`:focus` colour swap is a computed-style change with no
   * corresponding DOM mutation, so the Sensor's observer — `childList`
   * plus `attributeFilter: ["class", "style"]` — structurally cannot see
   * it, and neither can any other observation channel in this codebase.
   * This is the one trigger that can.
   *
   * Only the contrast channel, not a full `cycle()`: the interaction
   * changed no DOM and produces no new `FilterAction`, so `decide()` would
   * return an identical verdict at the cost of a second whole-document
   * `scan()`. And gated on a theme actually being applied, so an unthemed
   * or already-dark page pays nothing at all for listeners it still has
   * attached.
   *
   * Whole-document rather than scoped to the event target, deliberately:
   * `:hover` matches every ancestor of the pointer's element too, so a
   * vendor rule like `nav:hover .label { color: … }` repaints a node that
   * is neither the target nor under it. Bounding this by *frequency* (the
   * settle debounce) rather than by region is what keeps it honest —
   * a region bound would have to either miss those rules or re-derive the
   * whole containing subtree anyway. The pass is also zero-write when
   * nothing changed (#831's fixed-point discipline), so a spurious one
   * costs a walk and no DOM writes.
   */
  /**
   * The subtree the settled-interaction pass audits: a bounded climb from
   * the interaction's own target, falling back to `document.body` only when
   * there is no target to localise around (a focus event on the document
   * itself, or a pass scheduled before any target was recorded).
   */
  function interactionAuditRoot(): Element {
    const target = lastInteractionTarget
    if (!target?.isConnected) return document.body
    let root: HTMLElement = target
    for (let i = 0; i < INTERACTION_AUDIT_DEPTH; i += 1) {
      const parent: HTMLElement | null = root.parentElement
      if (parent === null || parent === document.body) break
      // The ancestor that holds the whole list is where "local to the
      // interaction" stops being true.
      if (parent.childElementCount > INTERACTION_AUDIT_MAX_FANOUT) break
      root = parent
    }
    return root
  }

  function runInteractionContrast(): void {
    interactionTimer = null
    // Gated per half, not once for both (bot-found, Codex review round 1 on
    // #1415). The document half is gated on a document theme; the shadow
    // half is not, and must not be — a scope's verdict is independent of the
    // document's, so a page reading already-dark natively (no
    // DARK_THEME_ATTR at all) can still hold committed shadow scopes with
    // live repairs, exactly the coexistence `buildHostTokenRule`'s own doc
    // comment describes. `recontrastAll()` is self-gating anyway: it
    // iterates only COMMITTED scopes.
    if (
      !interactionAuditOverBudget &&
      document.documentElement.hasAttribute(DARK_THEME_ATTR)
    ) {
      try {
        const startedAt = performance.now()
        runContrastChannel(interactionAuditRoot())
        const elapsed = performance.now() - startedAt
        if (elapsed > INTERACTION_AUDIT_BUDGET_MS) {
          interactionAuditOverBudget = true
          // Deliberately visible. A channel silently switching itself off is
          // worse than one that never ran, because the next person to wonder
          // why a hover repair stopped happening has nothing to find.
          // eslint-disable-next-line no-console
          console.info(
            `[some-filter] settled-interaction audit took ${Math.round(elapsed)}ms (budget ${INTERACTION_AUDIT_BUDGET_MS}ms); disabling it for this page. Full rounds still cover it.`
          )
        }
      } catch (error) {
        // Mirrors fire()'s own discipline: this runs from a timer with no
        // caller in a position to recover, so a throw must not escape into
        // an unhandled rejection that takes the listener path down with it
        // for the rest of the page's life. Caught per half so one failing
        // scope does not cost the other half its pass.
        // eslint-disable-next-line no-console
        console.error("[some-filter] interaction contrast pass failed:", error)
        // Bot-found (Codex confirming review on #1443): a throw from
        // auditLegibility/realizeLegibility/realizeForegroundRepairs above
        // happens *before* runContrastChannel's own onContrastAudited call,
        // so without this the document's last-reported audit — from before
        // this interaction changed the page's colours — keeps standing in
        // as current, indefinitely: nothing else re-triggers this channel.
        // Report `null`, not an empty audit (bot-found, Codex confirming
        // review round 3 on #1443: an earlier version of this fix used `[]`,
        // the same shape a genuinely-empty *successful* round already uses,
        // so a failed document audit merged indistinguishably from "nothing
        // to report" and could still read as confidently healthy if some
        // other, unaffected source had only passing pairs) — see
        // ContrastSourceReport's own doc comment.
        onContrastAudited?.(null)
      }
    }
    try {
      onInteractionSettled?.()
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[some-filter] interaction shadow pass failed:", error)
    }
  }

  const hoverCancel = createHoverCancel()

  function onInteraction(event: Event): void {
    // Our own realization never dispatches a pointer or focus event, so
    // there is no self-authorship check to make here — unlike the Sensor's
    // observer, whose every write is a potential trigger (Axiom 3.5). What
    // this does skip is interaction *inside* an extension-owned subtree
    // (the veil, the debug overlay), which is never vendor evidence.
    const target = event.target
    const node = target instanceof Node ? target : null
    if (node !== null && isExtensionAuthored(node)) return

    if (event.type === "pointerover") hoverCancel.mark(node)
    else if (event.type === "pointerout") hoverCancel.clear()

    // Remembered so the settled pass can audit where the interaction
    // actually happened rather than the whole document.
    lastInteractionTarget =
      node !== null && isHTMLElementNode(node) ? node : null

    if (interactionTimer !== null) clearTimeout(interactionTimer)
    interactionTimer = setTimeout(runInteractionContrast, INTERACTION_SETTLE_MS)
  }

  return {
    rescan(root: Element = document.body): void {
      // Immediate, not coalesced: rescan() is always an explicit,
      // caller-initiated round (the initial classification, an SPA
      // re-patch) — never a raw mutation-storm callback. Debouncing it
      // would make the whole auto-theme path's very first visible outcome
      // depend on a timer firing with no caller in a position to notice or
      // recover if it doesn't (content.ts's veil-lift lives inside onFire).
      // The coalescer is reserved for the one path Definition 7.2 actually
      // governs: the observer callback below, where a burst of N raw
      // mutations must still settle as exactly one decide/realize round.
      cycle(root)
    },
    observe(): void {
      for (const type of INTERACTION_EVENTS) {
        document.addEventListener(type, onInteraction, INTERACTION_LISTENER)
      }
      if (observer !== null) return
      // Watches <html> (document.documentElement), not document.body: a
      // vendor page can wholesale-replace body (and head) via
      // documentElement.replaceChild — a real SPA/hydration pattern, not
      // just a churn-suite construction — which detaches whatever node an
      // observer had captured, silently killing all future reclassification
      // (the observer keeps watching the orphaned old body forever; nothing
      // under the new one is ever seen again). document.documentElement
      // itself is never replaced by any of that — only its children are
      // swapped — so it is the one structurally stable root to observe
      // from. ingest() below re-reads `document.body` live at fire time
      // (not a value captured here) for the same reason: after a body
      // swap, `document.body` the getter already points at the new one.
      observer = new MutationObserver((mutations) => {
        // Axiom 3.5: our own actuation is not evidence. Without this,
        // realizing a verdict (injecting the theme sheet, lifting the
        // veil) is itself a mutation that schedules the next round, which
        // realizes the same verdict again — a closed loop that never
        // quiesces and never involves the vendor at all (#831).
        //
        // Two passes, both single and neither allocating, because they
        // want different things and the expensive question is only worth
        // asking once.
        //
        // An earlier version of this replaced the scheduling loop's
        // `return` with `mutations.filter(m => !isSelfAuthored(m))` so the
        // marking pass could see the whole batch. That turned an
        // O(1)-amortized callback into O(batch x depth) with a per-record
        // allocation, synchronously inside the observer microtask, on pages
        // whose defining property is that they churn — `isSelfAuthored`
        // walks ancestors via `closest()`. The commit priced that against
        // the guarded admission pass it removed, which was the wrong
        // comparison: what it actually replaced was the `return`.
        //
        // Marking does not need `isSelfAuthored` at all. It only has to
        // avoid our own nodes, and `markProvisional` already checks
        // `data-my-ext` directly on each added root — an attribute read, not
        // an ancestor walk. So marking runs first over the raw batch, and
        // scheduling keeps its original early exit.
        markAddedSubtrees(mutations)

        for (const mutation of mutations) {
          if (isSelfAuthored(mutation)) continue
          coalescer.trigger()
          return
        }
      })
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style"],
        // Required by isSelfAuthored's `sw-dirty` check — the veil's
        // ownership signal is only distinguishable from a vendor class
        // change by diffing against the previous value.
        attributeOldValue: true,
      })
    },
    teardown(): void {
      for (const type of INTERACTION_EVENTS) {
        document.removeEventListener(type, onInteraction, INTERACTION_LISTENER)
      }
      if (interactionTimer !== null) {
        clearTimeout(interactionTimer)
        interactionTimer = null
      }
      hoverCancel.clear()
      observer?.disconnect()
      observer = null
      coalescer.dispose()
      // A fill with no session behind it can never be lifted: teardown
      // stops every round, and the round is the only thing that clears a
      // mark. Left in place it would darken whatever the vendor inserted
      // last, permanently, on a page the extension has stopped theming.
      clearAllProvisional()
    },
  }
}
