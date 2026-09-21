/**
 * The Sensor (BC2, #1435) — Boundary Contract B3, B4, B5: the only reader
 * of VendorDOM.
 *
 * Wraps the mutation observer and the navigation event, resolves every
 * observed node against the catalogue and the layout table, keeps the
 * element ↔ card identity (`identity.ts`) and the retry queue
 * (`queue.ts`), and emits `Token`s. It never calls Core: tokens go onto
 * whatever `emit` it was given, and Core sees exactly two kinds of vendor
 * event through it — mutation-derived (`observed`, `gone`,
 * `unknown-shape`) and `nav` (B5).
 *
 * Invariants:
 *
 *   S1 — Structure is looked up, not discovered (B3). The one structural
 *        walk is `classify.ts`'s single `closest()`; nothing here walks
 *        ancestors in a loop or scans a subtree to decide what a node is.
 *   S2 — Unknown shape is a state (B4). A card the table cannot place is
 *        still observed (with `shape: "unknown"`), and a catalogue node that
 *        is neither a card nor a shell but that the table could not place
 *        either is reported as `unknown-shape`. Both are counted.
 *   S3 — Identity is per element, keys are per artifact. A recycle emits
 *        `gone` for the old key only once no element carries it.
 *   S4 — The retry loop terminates. Every queued element is under the
 *        budget; rejection is sticky against `scan()` and revocable on
 *        extraction (#1422).
 *   S5 — Observation is total on what it sees: `observe()` is what a scan,
 *        a mutation batch, a retry tick and a gesture refresh all call.
 */

import type { CustodyTarget } from "@censor/lib/content/actuator/bound"
import type { CoreFact } from "@censor/lib/content/core/actions"
import type { Token } from "@censor/lib/content/core/events"
import type { CardKey } from "@censor/lib/content/core/keys"
import { keyVideoId } from "@censor/lib/content/core/keys"
import type { Observation } from "@censor/lib/content/core/observation"
import {
  extractMeta,
  extractTitle,
  tryExtract,
} from "@censor/lib/content/extract/index"
import type { LayoutTable } from "@censor/lib/content/layout/schema"
import type { BoyoSurface } from "@censor/lib/content/layout/surface"
import {
  CARD_SELECTORS,
  classifyCard,
  detectOccluderEngine,
  occludedElements,
  SEL,
} from "@censor/lib/content/selectors"
import type { OccluderEngine } from "@censor/lib/content/selectors"
import type { SessionId } from "@some-extension/common"

import { classifyNode } from "./classify"
import type { Identity } from "./identity"
import { createIdentity } from "./identity"
import type { RetryQueue } from "./queue"
import { createRetryQueue, RESOLVE_BUDGET_MS, RETRY_INTERVAL_MS } from "./queue"

export const NAV_DEBOUNCE_MS = 150

export type SensorPorts = {
  readonly doc: Document
  readonly win: Window
  readonly table: LayoutTable
  readonly surface: () => BoyoSurface
  readonly clock: () => number
  readonly mintSession: () => SessionId
  readonly emit: (token: Token) => void
  readonly onFact: (fact: CoreFact) => void
}

/** The live queue state, for the health context and the debug layer. */
export type SensorCensus = {
  readonly unresolved: ReadonlyArray<{
    readonly el: HTMLElement
    readonly firstSeenAt: number
  }>
  /** Cards observed without a channel, still being re-sampled for one. */
  readonly channelPending: number
  /** What the static occluder is hiding right now. */
  readonly occluded: ReadonlyArray<HTMLElement>
  /** Which of those the Sensor holds nothing for. */
  readonly occludedUntracked: number
}

export type Sensor = {
  /** Subscribe to the document; does not scan. */
  start(): void
  /** Unsubscribe, stop the retry loop, forget every element. */
  stop(): void
  /** Observe every catalogue element on the page. */
  scan(): void
  /** Re-observe a card now (before a gesture reaches Core). */
  refresh(key: CardKey): void
  /** The elements carrying `key`, for the runtime to bind. */
  custodyOf(key: CardKey): ReadonlyArray<CustodyTarget>
  census(): SensorCensus
  readonly running: boolean
}

export function createSensor(ports: SensorPorts): Sensor {
  const identity: Identity = createIdentity()
  const queue: RetryQueue = createRetryQueue()
  const engine: OccluderEngine = detectOccluderEngine(ports.doc)
  /** Cards observed without a channel: re-sampled under the budget. */
  const channelPending = new Map<HTMLElement, number>()
  /** Cards whose channel budget is spent: not re-sampled again this session. */
  const channelAbandoned = new Set<HTMLElement>()
  /**
   * The last observation emitted per key, serialized. The retry loop's
   * `scan()` re-offers every card on the page every 500 ms while anything is
   * queued; a card whose evidence has not changed is not re-announced, so
   * Core (and the Actuator's diff behind it) see one token per real change.
   */
  const lastEmitted = new Map<CardKey, string>()
  let observer: MutationObserver | null = null
  let retryTimer: ReturnType<typeof setInterval> | null = null
  let navDebounce: ReturnType<typeof setTimeout> | null = null
  let running = false

  // ── Observation ────────────────────────────────────────────────────────

  function observationOf(
    el: HTMLElement,
    videoId: Observation["videoId"],
    channelId: Observation["channelId"],
    shape: Observation["shape"]
  ): Observation {
    const meta = extractMeta(el)
    return {
      videoId,
      channelId,
      channelName: meta.channelName,
      title: extractTitle(el),
      duration: meta.duration,
      uploadDate: meta.uploadDate,
      surface: ports.surface(),
      renderer: el.tagName.toLowerCase(),
      shape,
    }
  }

  /** S5: one path for every element the Sensor is ever handed. */
  function observe(el: HTMLElement): void {
    if (!running) return
    const now = ports.clock()
    const cls = classifyNode(el, ports.surface(), ports.table)

    if (cls.kind === "not-card") {
      // A container, or not ours. Whatever it carried as a card is over.
      queue.dequeue(el)
      channelPending.delete(el)
      releaseElement(el, now)
      return
    }

    if (cls.kind === "shell") {
      releaseElement(el, now)
      if (queue.enqueue(el, now)) {
        ports.onFact({ kind: "mount.queued", tag: el.tagName.toLowerCase() })
        ensureRetryLoop()
      }
      return
    }

    const extracted = tryExtract(el)
    if (extracted.kind === "raw") {
      // Video-shaped (a watch href is there) but nothing parseable in it:
      // queued like a shell, and rejected at budget like one. It stays under
      // the occluder afterwards — the fail-closed answer, and
      // `OccluderReleases`'s to report (#1422).
      releaseElement(el, now)
      if (queue.enqueue(el, now)) ensureRetryLoop()
      return
    }

    queue.dequeue(el)
    queue.revive(el)
    const rec = identity.reconcile(el, extracted.videoId)
    if (rec.kind === "churn") {
      ports.onFact({ kind: "churn.ignored", videoId: keyVideoId(rec.key) })
      // Re-observed under the key it kept; custody is re-asserted by Core's
      // render, and nothing about the artifact changed.
      return
    }
    if (rec.kind === "recycled" && rec.previousGone) {
      lastEmitted.delete(rec.previous)
      ports.emit({ kind: "gone", key: rec.previous, t: now })
    }
    if (rec.kind === "recycled") {
      ports.onFact({ kind: "recycled", videoId: keyVideoId(rec.key) })
    }

    if (extracted.kind === "video-only") {
      if (!channelPending.has(el) && !channelAbandoned.has(el)) {
        channelPending.set(el, now)
        ensureRetryLoop()
      }
    } else {
      channelPending.delete(el)
      channelAbandoned.delete(el)
    }

    // On an engine without `:has()`, the fallback rule occludes an
    // enclosing rich-item unconditionally; that wrapper is nested custody
    // of this card so the stamp releases it (D6, #1504's round-2 finding).
    if (!engine.hasSelector) {
      const wrapper = el.parentElement?.closest(FALLBACK_TAGS)
      if (wrapper instanceof HTMLElement && classifyCard(wrapper) !== "card") {
        identity.addNested(rec.key, wrapper)
      }
    }

    if (cls.shape === "unknown") {
      ports.onFact({
        kind: "shape.unknown",
        tag: el.tagName.toLowerCase(),
        surface: ports.surface(),
        reason: cls.reason,
        shape: "unknown",
      })
    }

    const observation = observationOf(
      el,
      extracted.videoId,
      extracted.channelId,
      cls.shape
    )
    const serialized = JSON.stringify(observation)
    if (rec.kind === "same" && lastEmitted.get(rec.key) === serialized) return
    lastEmitted.set(rec.key, serialized)
    ports.emit({ kind: "observed", key: rec.key, observation, t: now })
  }

  /** `el` stopped being a card: release its custody, and say so if its key is gone. */
  function releaseElement(el: HTMLElement, now: number): void {
    const released = identity.release(el)
    if (released?.gone) {
      lastEmitted.delete(released.key)
      ports.emit({ kind: "gone", key: released.key, t: now })
    }
  }

  // ── Retry loop ─────────────────────────────────────────────────────────

  function retry(): void {
    if (!running) return
    const now = ports.clock()

    for (const { el } of queue.entries()) {
      if (!el.isConnected) {
        queue.dequeue(el)
        continue
      }
      const cls = classifyNode(el, ports.surface(), ports.table)
      if (cls.kind === "not-card") {
        queue.dequeue(el)
        continue
      }
      if (cls.kind === "card" && tryExtract(el).kind !== "raw") {
        observe(el)
        continue
      }
      if (queue.spent(el, now)) {
        queue.reject(el)
        ports.onFact({ kind: "mount.rejected", tag: el.tagName.toLowerCase() })
      }
    }

    for (const [el, since] of channelPending) {
      if (!el.isConnected) {
        channelPending.delete(el)
        continue
      }
      const extracted = tryExtract(el)
      if (extracted.kind === "full") {
        observe(el)
      } else if (now - since >= RESOLVE_BUDGET_MS) {
        channelPending.delete(el)
        channelAbandoned.add(el)
        const key = identity.keyOf(el)
        if (key !== null) {
          ports.onFact({ kind: "channel.abandoned", videoId: keyVideoId(key) })
        }
      }
    }

    recheckRejected()
    maybeStopRetryLoop()
  }

  /**
   * Re-examine what was given up on, in case something has become a card.
   * Revival means "extraction would now succeed", not "it looks like a
   * card" — reviving on shape alone would re-queue a video-shaped element
   * whose href has no parseable id, forever (#1422).
   */
  function recheckRejected(): void {
    for (const el of queue.rejected()) {
      if (!el.isConnected) {
        queue.revive(el)
        continue
      }
      if (classifyCard(el) !== "card" || tryExtract(el).kind === "raw") continue
      queue.revive(el)
      observe(el)
    }
  }

  function ensureRetryLoop(): void {
    if (retryTimer !== null || !running) return
    // Lifetime: stopped by maybeStopRetryLoop() once nothing is queued, and
    // by stop(). Not tied to visibility — the same exemption VideoManager's
    // loop carried, for the same reason (this extension's own call).
    // eslint-disable-next-line extension-charter/require-named-lifetime -- lifetime stated above
    retryTimer = setInterval(() => {
      try {
        retry()
        scan()
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[BOYO] sensor retry threw", err)
      }
    }, RETRY_INTERVAL_MS)
  }

  function maybeStopRetryLoop(): void {
    if (queue.size === 0 && channelPending.size === 0 && retryTimer !== null) {
      clearInterval(retryTimer)
      retryTimer = null
    }
  }

  // ── Mutation and navigation ────────────────────────────────────────────

  function onMutations(mutations: ReadonlyArray<MutationRecord>): void {
    const candidates = new Set<HTMLElement>()
    // Cards whose subtree changed go first: a cell recycled into a lockup
    // for the same video must release its key before the lockup asks for
    // it (#1504, round 4).
    const enclosing = new Set<HTMLElement>()
    let removed = false

    for (const m of mutations) {
      if (
        m.type === "attributes" &&
        m.attributeName === "data-video-id" &&
        m.target instanceof HTMLElement &&
        m.target.matches(SEL)
      ) {
        candidates.add(m.target)
        continue
      }
      if (m.type === "childList") {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue
          if (node.matches(SEL)) candidates.add(node)
          node
            .querySelectorAll<HTMLElement>(SEL)
            .forEach((el) => candidates.add(el))
        }
        const around =
          m.target instanceof Element ? m.target.closest(SEL) : null
        if (around instanceof HTMLElement) enclosing.add(around)
        if (m.removedNodes.length > 0) removed = true
      }
    }

    enclosing.forEach(observe)
    candidates.forEach((el) => {
      if (!enclosing.has(el)) observe(el)
    })
    retry()
    if (removed) prune()
    ports.onFact({
      kind: "mutation.batch",
      candidates: candidates.size + enclosing.size,
    })
  }

  /** Release every element that left the document. */
  function prune(): void {
    const now = ports.clock()
    for (const key of identity.keys()) {
      for (const { el } of identity.custodyOf(key)) {
        if (!el.isConnected) releaseElement(el, now)
      }
    }
  }

  function onNavigate(): void {
    if (navDebounce !== null) clearTimeout(navDebounce)
    navDebounce = setTimeout(() => {
      navDebounce = null
      if (!running) return
      forget()
      ports.emit({
        kind: "nav",
        session: ports.mintSession(),
        t: ports.clock(),
      })
      // The page after a chip navigation reuses elements in place; nothing
      // mutated from the observer's point of view, so look now.
      scan()
    }, NAV_DEBOUNCE_MS)
  }

  function forget(): void {
    identity.clear()
    queue.clear()
    channelPending.clear()
    channelAbandoned.clear()
    lastEmitted.clear()
    if (retryTimer !== null) {
      clearInterval(retryTimer)
      retryTimer = null
    }
  }

  function scan(): void {
    if (!running) return
    ports.doc.querySelectorAll<HTMLElement>(SEL).forEach(observe)
  }

  return {
    start(): void {
      if (running) return
      running = true
      observer = new MutationObserver(onMutations)
      observer.observe(ports.doc.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-video-id"],
      })
      ports.win.addEventListener("yt-navigate-finish", onNavigate)
    },

    stop(): void {
      if (!running) return
      running = false
      observer?.disconnect()
      observer = null
      ports.win.removeEventListener("yt-navigate-finish", onNavigate)
      if (navDebounce !== null) {
        clearTimeout(navDebounce)
        navDebounce = null
      }
      forget()
    },

    scan,

    refresh(key: CardKey): void {
      for (const { el, role } of identity.custodyOf(key)) {
        if (role === "anchor") observe(el)
      }
    },

    custodyOf(key: CardKey): ReadonlyArray<CustodyTarget> {
      return identity.custodyOf(key)
    },

    census(): SensorCensus {
      const occluded = occludedElements(ports.doc, engine)
      let untracked = 0
      for (const el of occluded) {
        if (identity.keyOf(el) === null && !queue.has(el)) untracked += 1
      }
      return {
        unresolved: queue.entries(),
        channelPending: channelPending.size,
        occluded,
        occludedUntracked: untracked,
      }
    },

    get running(): boolean {
      return running
    },
  }
}

/** The tags whose fallback rule occludes them unconditionally without `:has()`. */
const FALLBACK_TAGS = CARD_SELECTORS.filter((s) => s.unguardedFallback === true)
  .map((s) => s.tag)
  .join(",")
