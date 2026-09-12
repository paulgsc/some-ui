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
import { rgbaToCss } from "@filter/lib/content/modify-colors"
import { PREPAINT_DIRTY_CLASS } from "@filter/lib/content/prepaint"
import { DARK_THEME_STYLE_ID } from "@filter/lib/content/theme-apply"
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

import { DYNAMIC_STYLE_ID, isHTMLElementNode, realize } from "./actuator"
import type { FilterAction, SurfaceAttr, SurfaceKey } from "./contracts"
import {
  auditLegibility,
  decideLegibility,
  realizeLegibility,
} from "./legibility-audit"
import type { Swatch } from "./swatches"
import { decide } from "./theme-adapter"

/** Definition 7.2's `R`, declared once (§8.3's conformance requirement). */
export const RECONCILE_POLICY: ReconcilePolicy = { debounceMs: 50 }
export const BOUNDED_DELIVERY_MS = 250

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
]

/**
 * Runs `fn` with this extension's own color sheets disabled, so every
 * `getComputedStyle` inside it reads the *vendor's* background rather than
 * the theme we painted over it.
 *
 * `shouldSkip`'s `[data-sw-patched]` exclusion covers only the surfaces the
 * Actuator tagged. The static layer (`buildDarkThemeCSS`) recolors far more
 * than that — `html`/`body`, `th`, `pre`, `code`, `input`, `textarea`,
 * `select`, `dialog` — with `!important` rules keyed on element type, and
 * none of those carriers are tagged. Their post-activation computed
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
  | { readonly kind: "ok"; readonly actions: ReadonlyArray<FilterAction> }
  | { readonly kind: "error"; readonly error: unknown }

export type OnFire = (outcome: FireOutcome) => void

export function createContentSession(
  swatch: Swatch | null,
  session: SessionLifecycle,
  onFire?: OnFire
): ContentSession {
  const hypothesis = createHypothesis<SurfaceKey, SurfaceAttr>()
  const provenance: ProvenanceStore<SurfaceKey> = createProvenanceStore()
  let lastScan: ScanResult = { elementsByKey: new Map(), attrsByKey: new Map() }
  let lastRoot: Element = document.body
  let observer: MutationObserver | null = null
  let evidenceEpoch = session.epoch

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

  function fire(): void {
    let outcome: FireOutcome
    try {
      const actions = invoke(hypothesis, { decide: (h) => decide(h, swatch) })
      realize(actions, lastScan.elementsByKey)

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
        const legibilityScan = auditLegibility(lastRoot)
        const legibilityActions = decideLegibility(legibilityScan.attrsByKey)
        realizeLegibility(legibilityActions, legibilityScan.elementsByKey)
      }

      outcome = { kind: "ok", actions }
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
    }
    onFire?.(outcome)
  }

  /** One full round: sense, then decide/realize on what was sensed. */
  function cycle(root: Element): void {
    ingest(root)
    fire()
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
        for (const mutation of mutations) {
          // Axiom 3.5: our own actuation is not evidence. Without this,
          // realizing a verdict (injecting the theme sheet, lifting the
          // veil) is itself a mutation that schedules the next round, which
          // realizes the same verdict again — a closed loop that never
          // quiesces and never involves the vendor at all (#831).
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
      observer?.disconnect()
      observer = null
      coalescer.dispose()
    },
  }
}
