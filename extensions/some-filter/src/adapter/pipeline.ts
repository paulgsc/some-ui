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
 * same `attributeFilter: ["class", "style"]` as before re-triggers it.
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
 * `decide`/`realize` cycle.
 */

import { parseColor, relativeLuminance } from "@filter/lib/content/color"
import { rgbaToCss } from "@filter/lib/content/modify-colors"
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

import { realize } from "./actuator"
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

  function ingest(root: Element): void {
    try {
      lastScan = scan(root)
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

  const coalescer: Coalescer = createCoalescer(RECONCILE_POLICY, fire)

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
      ingest(root)
      fire()
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
          if (mutation.type === "childList" || mutation.type === "attributes") {
            ingest(document.body)
            coalescer.trigger()
            return
          }
        }
      })
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style"],
      })
    },
    teardown(): void {
      observer?.disconnect()
      observer = null
      coalescer.dispose()
    },
  }
}
