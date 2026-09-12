/**
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
  "IFRAME",
])

function isExtensionOwned(el: Element): boolean {
  if (el.id === "__sw_overlay_root") return true
  if (el.hasAttribute("data-my-ext")) return true
  if (el.closest("[data-my-ext]")) return true
  return false
}

function shouldSkip(el: Element): boolean {
  return SKIP_TAGS.has(el.tagName) || isExtensionOwned(el)
}

function isRendered(style: CSSStyleDeclaration): boolean {
  return style.display !== "none" && style.visibility !== "hidden"
}

function isShadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === Node.DOCUMENT_FRAGMENT_NODE
}

/** Mirrors `pipeline.ts`'s own `ownTextColor` exactly (own private copy — see this module's header for why). */
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

/**
 * True when `style` carries any rendering feature this module has no
 * reliable way to reduce to a single composited color — a background image
 * of any kind (not just a gradient: an arbitrary photo's own colors are
 * unknown), a CSS filter, a backdrop-filter, or a non-normal blend mode.
 * `""` is treated identically to the spec's own unset default
 * (`"none"`/`"normal"`) for every one of these checks — jsdom's computed
 * style leaves `background-image`/`filter`/`mix-blend-mode`/`backdrop-filter`
 * all at `""` rather than their spec-defined defaults for an element with no
 * explicit declaration (confirmed directly against jsdom, not assumed), so
 * treating only the literal spec string as "nothing to worry about" would
 * misclassify almost every ordinary element in this test environment as a
 * rendering hazard.
 */
function hasUnresolvableRenderingHazard(style: CSSStyleDeclaration): boolean {
  const isUnsetOr = (value: string, none: string): boolean =>
    value !== "" && value !== none

  if (isUnsetOr(style.backgroundImage, "none")) return true
  if (isUnsetOr(style.filter, "none")) return true
  if (isUnsetOr(style.mixBlendMode, "normal")) return true
  // getPropertyValue (rather than the camelCase accessor) always returns a
  // plain string — jsdom does not implement backdrop-filter at all, so this
  // is "" unconditionally there, same as every other unset case above.
  if (isUnsetOr(style.getPropertyValue("backdrop-filter"), "none")) return true

  // CSS opacity < 1 composites the *entire* element — its whole rendered
  // subtree, foreground included — as one group against whatever sits
  // behind it, not a per-layer background-color concern this module's
  // "accumulate background colors" model can represent (bot-found: black
  // text on an opaque white ancestor with opacity:0.1 over a white canvas
  // renders as light grey on white, not the raw black-on-white this model
  // would otherwise compare). jsdom's own unset default reads back `""`
  // here too (confirmed directly, same as every property above), which
  // Number.parseFloat turns into NaN — excluded from the `< 1` check by
  // construction, the same "nothing to worry about" outcome a real
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
 * Returns `"underdetermined"` instead, the moment any layer *anywhere in the
 * chain* trips `hasUnresolvableRenderingHazard` — checked all the way to
 * `document.documentElement` regardless of where color accumulation itself
 * resolves. A hazard (a CSS filter especially) applies to an ancestor's
 * *entire* rendered subtree, not just that ancestor's own background layer,
 * so an outer `filter: brightness(0)` still recolors an inner, already-fully-
 * opaque child's rendered output (bot-found: black text on an opaque white
 * child inside such an ancestor renders black-on-black, not the 21:1 this
 * function would otherwise report if it stopped checking at the opaque
 * layer). Color *accumulation* still stops once fully opaque — there is
 * nothing further out left to composite — but hazard-checking does not.
 */
export function resolveEffectiveBackdrop(
  el: Element
): RGBA | "underdetermined" {
  let acc: RGBA = [0, 0, 0, 0]
  let resolved: RGBA | null = null
  let cur: Element | null = el

  while (cur !== null) {
    const style = getComputedStyle(cur)
    if (hasUnresolvableRenderingHazard(style)) return "underdetermined"

    if (resolved === null) {
      const layerColor = parseColor(style.backgroundColor)
      if (layerColor !== null) {
        acc = compositeOver(acc, layerColor)
        if (acc[3] >= 0.999) resolved = [acc[0], acc[1], acc[2], 1]
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
  readonly foreground: RGBA
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
  const backdropKey =
    attr.backdrop === "underdetermined"
      ? "underdetermined"
      : rgbaToCss(attr.backdrop)
  return `${rgbaToCss(attr.foreground)}~${backdropKey}`
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
 */
export function auditLegibility(
  root: Element | ShadowRoot
): LegibilityScanResult {
  const elementsByKey = new Map<LegibilityKey, Array<Element>>()
  const attrsByKey = new Map<LegibilityKey, LegibilityAttr>()

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  let node: Node | null = walker.nextNode()

  while (node !== null) {
    if (isHTMLElementNode(node) && !shouldSkip(node)) {
      const style = getComputedStyle(node)
      if (isRendered(style)) {
        const foreground = ownTextColor(node, style)
        if (foreground !== null) {
          const attr: LegibilityAttr = {
            foreground,
            backdrop: resolveEffectiveBackdrop(node),
          }
          const key = legibilityKeyFor(attr)
          const list = elementsByKey.get(key)
          if (list !== undefined) {
            list.push(node)
          } else {
            elementsByKey.set(key, [node])
            attrsByKey.set(key, attr)
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
    if (attr.backdrop === "underdetermined") {
      actions.push({ kind: "tag-legibility", key, verdict: "underdetermined" })
      continue
    }

    // A translucent own foreground (e.g. rgba(0,0,0,0.5)) does not render
    // as its own raw RGB channels — it renders as itself composited over
    // the resolved (already-opaque) backdrop, exactly like a background
    // layer does in resolveEffectiveBackdrop above (bot-found: rgba(0,0,0,
    // 0.5) over white renders as mid-grey at ~4:1, not the 21:1 comparing
    // raw black against white would report).
    const renderedForeground = compositeOver(attr.foreground, attr.backdrop)
    const fgLuminance = relativeLuminance(
      renderedForeground[0],
      renderedForeground[1],
      renderedForeground[2]
    )
    const bgLuminance = relativeLuminance(
      attr.backdrop[0],
      attr.backdrop[1],
      attr.backdrop[2]
    )
    if (contrastRatio(fgLuminance, bgLuminance) < MIN_CONTRAST_RATIO) {
      actions.push({ kind: "tag-legibility", key, verdict: "violated" })
    }
  }

  return actions
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
