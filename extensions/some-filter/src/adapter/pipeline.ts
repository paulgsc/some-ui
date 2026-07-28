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

import { parseColor, relativeLuminance } from "@filter/lib/content/color"
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

import { DYNAMIC_STYLE_ID, realize } from "./actuator"
import type { FilterAction, SurfaceAttr, SurfaceKey } from "./contracts"
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

function readAttr(el: Element): SurfaceAttr | null {
  const bg = getComputedStyle(el).backgroundColor
  const c = parseColor(bg)
  if (c === null) return null
  return {
    color: c,
    luminance: relativeLuminance(c[0], c[1], c[2]),
    opacity: c[3],
  }
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

/** Walks `root`'s descendants (never `root` itself — matches `patchAll`'s old scope; `root`'s own canvas is the static layer's job). */
export function scan(root: Element): ScanResult {
  const elementsByKey = new Map<SurfaceKey, Array<Element>>()
  const attrsByKey = new Map<SurfaceKey, SurfaceAttr>()

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  let node: Node | null = walker.nextNode()

  while (node !== null) {
    if (node instanceof HTMLElement && !shouldSkip(node)) {
      const attr = readAttr(node)
      if (attr !== null) {
        const key = rgbaToCss(attr.color)
        const list = elementsByKey.get(key)
        if (list !== undefined) {
          list.push(node)
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

export type OnFire = (actions: ReadonlyArray<FilterAction>) => void

export function createContentSession(
  swatch: Swatch | null,
  session: SessionLifecycle,
  onFire?: OnFire
): ContentSession {
  const hypothesis = createHypothesis<SurfaceKey, SurfaceAttr>()
  const provenance: ProvenanceStore<SurfaceKey> = createProvenanceStore()
  let lastScan: ScanResult = { elementsByKey: new Map(), attrsByKey: new Map() }
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

      lastScan = withVendorColorsVisible(() => scan(root))
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
    let actions: ReadonlyArray<FilterAction> = []
    try {
      actions = invoke(hypothesis, { decide: (h) => decide(h, swatch) })
      realize(actions, lastScan.elementsByKey)
    } catch (error) {
      // onFire must run regardless — content.ts uses it to set the debug
      // attrs a live-browser wait (or a e2e test) polls for and to resolve
      // the veil (commitVisualState/disablePrepaint). A thrown decide/
      // realize left this callback un-run entirely, holding the page under
      // the veil forever with the failure visible nowhere but here.
      // eslint-disable-next-line no-console
      console.error("[some-filter] pipeline fire() failed:", error)
    }
    onFire?.(actions)
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
