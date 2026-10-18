/**
 * The Sensor (BC2, #1435) — Boundary Contract B3, B4, B5: the only reader
 * of VendorDOM that Core hears from. (The Actuator's watch hold reads the
 * page too, only to keep its own writes held: `actuator/watch-hold.ts`.)
 *
 * Wraps the mutation observer and the navigation event, resolves every
 * observed node against the catalogue and the layout table, keeps the
 * element ↔ card identity (`identity.ts`) and the retry queue
 * (`queue.ts`), and emits `Token`s. Tokens go onto whatever `emit` it was
 * given, and Core sees exactly two kinds of vendor event through it:
 * mutation-derived (`observed`, `gone`, `unknown-shape`, `watched`,
 * `described`) and `nav` (B5). It asks Core one question, through the
 * `admits` port: whether an autoplay may go on into a video. On a no it
 * holds that one vendor event (`onYtNavigate`, #1805).
 *
 * Design properties (not declared review invariants; the behavioural ones
 * are pinned by `sensor.test.ts`):
 *
 *   - Structure is looked up, not discovered (B3). What a node is comes
 *     from the catalogue predicate and the layout table; the only walks
 *     are single `closest()` calls (the enclosing card for the table's
 *     context, a mutation's enclosing card, the fallback wrapper, the
 *     hidden page a card's surface comes from), never a loop over
 *     ancestors.
 *   - Unknown shape is a state (B4). A card the table cannot place is
 *     still observed (with `shape: "unknown"`), queued if it has no id yet,
 *     and reported once per element as `unknown-shape`.
 *   - Identity is per element, keys are per artifact. A recycle emits
 *     `gone` for the old key only once no element carries it.
 *   - The retry loop terminates. Every queued element is under the
 *     budget; rejection is sticky against `scan()` and revocable on
 *     extraction (#1422).
 *   - Observation is total on what it sees: `observe()` is what a scan,
 *     a mutation batch and a retry tick all call.
 */

import type { CustodyTarget } from "@censor/lib/content/actuator/bound"
import type { CoreFact } from "@censor/lib/content/core/actions"
import type { Token } from "@censor/lib/content/core/events"
import type { CardKey } from "@censor/lib/content/core/keys"
import { keyVideoId } from "@censor/lib/content/core/keys"
import type { Observation } from "@censor/lib/content/core/observation"
import {
  extractCarriesChannel,
  extractIsArtist,
  extractIsShort,
  extractMeta,
  extractTitle,
  extractUploadDate,
  readAutonav,
  readDescription,
  readWatch,
  tryExtract,
} from "@censor/lib/content/extract/index"
import type { UnknownShapeReason } from "@censor/lib/content/layout/lookup"
import type { LayoutTable } from "@censor/lib/content/layout/schema"
import type { BoyoSurface } from "@censor/lib/content/layout/surface"
import {
  HIDDEN_PAGE_SELECTOR,
  hiddenPageSurface,
} from "@censor/lib/content/layout/surface"
import {
  classifyCard,
  detectOccluderEngine,
  FACE_CONTROL_ATTRIBUTE,
  FALLBACK_TAGS,
  occludedElements,
  SEL,
} from "@censor/lib/content/selectors"
import type { OccluderEngine } from "@censor/lib/content/selectors"
import type { VideoId } from "@censor/types/ids"
import type { SessionId } from "@some-extension/common"

import { classifyNode } from "./classify"
import type { Identity } from "./identity"
import { createIdentity } from "./identity"
import type { RetryQueue } from "./queue"
import { createRetryQueue, RESOLVE_BUDGET_MS, RETRY_INTERVAL_MS } from "./queue"

export const NAV_DEBOUNCE_MS = 150

const NO_WATCH = JSON.stringify(null)

export type SensorPorts = {
  readonly doc: Document
  readonly win: Window
  readonly table: LayoutTable
  /** The surface the page being shown is on. */
  readonly surface: () => BoyoSurface
  readonly clock: () => number
  readonly mintSession: () => SessionId
  readonly emit: (token: Token) => void
  readonly onFact: (fact: CoreFact) => void
  /** Core's answer: whether autoplay may go on into `videoId` (#1805). */
  readonly admits: (videoId: VideoId) => boolean
}

/** The live queue state, for the health context and the debug layer. */
export type SensorCensus = {
  readonly unresolved: ReadonlyArray<{
    readonly el: HTMLElement
    readonly firstSeenAt: number
  }>
  /** Cards observed without a channel, still being re-sampled for one. */
  readonly channelPending: ReadonlyArray<{
    readonly el: HTMLElement
    readonly firstSeenAt: number
  }>
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
  /** The elements carrying `key`, for the runtime to bind. */
  custodyOf(key: CardKey): ReadonlyArray<CustodyTarget>
  /** The shown watch page's description, where the face control goes. */
  description(): HTMLElement | null
  census(): SensorCensus
  /** How many elements are queued; O(1), unlike {@link census}. */
  readonly queued: number
  readonly running: boolean
}

export function createSensor(ports: SensorPorts): Sensor {
  const identity: Identity = createIdentity()
  const queue: RetryQueue = createRetryQueue()
  const engine: OccluderEngine = detectOccluderEngine(ports.doc)
  /** Cards observed without a channel: re-sampled under the budget. */
  const channelPending = new Map<HTMLElement, number>()
  /** Cards whose channel budget is spent: not re-sampled again this session. */
  let channelAbandoned = new WeakSet<HTMLElement>()
  /**
   * Cards with a channel but no name yet, or no title yet: either can
   * hydrate in place after the card, a text change no mutation this
   * observes, and the plate's initial reads the name and the lane (QD15)
   * both. Re-read under the same budget, and given up silently.
   */
  const namePending = new Map<
    HTMLElement,
    { since: number; name: boolean; title: boolean }
  >()
  let nameAbandoned = new WeakSet<HTMLElement>()
  /**
   * Cards observed with no upload date at all, kept under the same budget: the
   * date decides whether a card is shown (#1803), and YouTube can fill an
   * empty run in without a mutation the observer sees (a text node's data).
   * Pending keeps the retry loop, whose `scan()` re-reads every card, alive
   * until the date arrives or the budget is spent. A Short is held whatever
   * its date, so it is never pending.
   */
  const datePending = new Map<HTMLElement, number>()
  let dateAbandoned = new WeakSet<HTMLElement>()
  /** Elements already reported as `unknown-shape` this session. */
  let unknownReported = new WeakSet<HTMLElement>()
  /**
   * The last observation emitted per element, serialized. The retry loop's
   * `scan()` re-offers every card on the page every 500 ms while anything is
   * queued; an element whose evidence has not changed is not re-announced,
   * so Core (and the Actuator's diff behind it) see one token per real
   * change. Per element, not per key: two elements showing one video (a
   * feed card and a sidebar card) would otherwise each differ from the
   * other's last token and re-announce on every tick.
   */
  const lastEmitted = new Map<HTMLElement, string>()
  /**
   * The page's own video as last announced, serialized. Core starts with
   * none, so "none" needs no announcing, and keeps it across `nav`.
   */
  let lastWatch = NO_WATCH
  /**
   * The watch page's video, and since when it is: re-read by the retry loop
   * under the same budget, since its date arrives after it, and can arrive
   * as a text node's data, which no mutation here shows. Which date is the
   * video's own is Core's to tell (R8).
   */
  let watchSince: { videoId: VideoId | null; since: number } | null = null
  /**
   * The watch page's description as last seen, and whether the face control
   * was in it. YouTube can draw the description late, or again, with no
   * change in the reading, so it is announced on its own (`described`).
   */
  let lastDescription: { el: HTMLElement | null; offered: boolean } = {
    el: null,
    offered: false,
  }
  let observer: MutationObserver | null = null
  let retryTimer: ReturnType<typeof setInterval> | null = null
  let navDebounce: ReturnType<typeof setTimeout> | null = null
  let running = false

  // ── Observation ────────────────────────────────────────────────────────

  /** `ports.surface()`, unless `el` is under a hidden page (`HIDDEN_PAGE_SELECTOR`). */
  function cardSurface(el: HTMLElement): BoyoSurface {
    const page = el.closest(HIDDEN_PAGE_SELECTOR)
    return page === null
      ? ports.surface()
      : hiddenPageSurface(
          page.tagName.toLowerCase(),
          page.getAttribute("page-subtype")
        )
  }

  function observationOf(
    el: HTMLElement,
    videoId: Observation["videoId"],
    channelId: Observation["channelId"],
    shape: Observation["shape"],
    surface: BoyoSurface
  ): Observation {
    const meta = extractMeta(el)
    return {
      videoId,
      channelId,
      channelName: meta.channelName,
      title: extractTitle(el),
      duration: meta.duration,
      uploadDate: extractUploadDate(el),
      short: extractIsShort(el),
      artist: extractIsArtist(el),
      surface,
      renderer: el.tagName.toLowerCase(),
      shape,
    }
  }

  /** One path for every element the Sensor is ever handed. */
  function observe(el: HTMLElement): void {
    if (!running) return
    const now = ports.clock()
    const surface = cardSurface(el)
    const cls = classifyNode(el, surface, ports.table)

    if (cls.kind === "not-card") {
      // A container, or not ours. Whatever it carried as a card is over.
      queue.dequeue(el)
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
      // Card-shaped but with no parseable video id: queued like a shell, and
      // rejected at budget like one. It stays under the occluder afterwards,
      // the fail-closed answer, and `OccluderReleases`'s to report (#1422).
      releaseElement(el, now)
      if (queue.enqueue(el, now)) {
        const tag = el.tagName.toLowerCase()
        ports.onFact({ kind: "mount.queued", tag })
        if (cls.shape === "unknown") reportUnknown(el, cls.reason, now, surface)
        ensureRetryLoop()
      }
      return
    }

    queue.dequeue(el)
    queue.revive(el)
    const rec = identity.reconcile(el, extracted.videoId)
    if (rec.kind === "churn") {
      // Kept its key, and nothing about the artifact changed.
      ports.onFact({ kind: "churn.ignored", videoId: keyVideoId(rec.key) })
      return
    }
    // Per element, not per key: a second carrier of a video Core already
    // holds is as much a miss of the table as the first.
    if (cls.shape === "unknown") reportUnknown(el, cls.reason, now, surface)
    if (rec.kind === "recycled") {
      // The channel budget belonged to the previous video.
      channelPending.delete(el)
      channelAbandoned.delete(el)
      namePending.delete(el)
      nameAbandoned.delete(el)
      datePending.delete(el)
      dateAbandoned.delete(el)
      if (rec.previousGone) {
        ports.emit({ kind: "gone", key: rec.previous, t: now })
      }
    }

    // On an engine without `:has()`, the fallback rule occludes an
    // enclosing rich-item unconditionally; that wrapper is nested custody
    // of this card so the stamp releases it (D6, #1504).
    let custodyChanged = false
    if (!engine.hasSelector) {
      const wrapper = el.parentElement?.closest(FALLBACK_TAGS)
      if (wrapper instanceof HTMLElement && classifyCard(wrapper) !== "card") {
        const nested = identity.addNested(rec.key, wrapper)
        custodyChanged = nested.changed
        if (nested.released?.gone) {
          ports.emit({ kind: "gone", key: nested.released.key, t: now })
        }
      }
    }

    const observation = observationOf(
      el,
      extracted.videoId,
      extracted.channelId,
      cls.shape,
      surface
    )
    if (observation.channelId === null) {
      if (
        extractCarriesChannel(el) &&
        !channelPending.has(el) &&
        !channelAbandoned.has(el)
      ) {
        channelPending.set(el, now)
        ensureRetryLoop()
      }
    } else {
      channelPending.delete(el)
      channelAbandoned.delete(el)
    }
    const name =
      observation.channelId !== null && observation.channelName === null
    const title = observation.title === null
    if (name || title) {
      if (!namePending.has(el) && !nameAbandoned.has(el)) {
        namePending.set(el, { since: now, name, title })
        ensureRetryLoop()
      }
    } else {
      namePending.delete(el)
      nameAbandoned.delete(el)
    }
    if (observation.uploadDate || observation.short) {
      datePending.delete(el)
    } else if (!datePending.has(el) && !dateAbandoned.has(el)) {
      datePending.set(el, now)
      ensureRetryLoop()
    }
    const serialized = JSON.stringify(observation)
    // A new nested wrapper is only stamped by the render a token causes.
    if (!custodyChanged && lastEmitted.get(el) === serialized) return
    lastEmitted.set(el, serialized)
    ports.emit({ kind: "observed", key: rec.key, observation, t: now })
  }

  function reportUnknown(
    el: HTMLElement,
    reason: UnknownShapeReason,
    now: number,
    surface: BoyoSurface
  ): void {
    if (unknownReported.has(el)) return
    unknownReported.add(el)
    ports.emit({
      kind: "unknown-shape",
      tag: el.tagName.toLowerCase(),
      surface,
      reason,
      t: now,
    })
  }

  /**
   * `el` stopped being a card: release its custody. A key nothing carries is
   * gone; a key another element still carries is re-announced, because the
   * Actuator drops an element's stamp and plate only on a render of its key.
   */
  function releaseElement(el: HTMLElement, now: number): void {
    lastEmitted.delete(el)
    channelPending.delete(el)
    channelAbandoned.delete(el)
    namePending.delete(el)
    nameAbandoned.delete(el)
    datePending.delete(el)
    dateAbandoned.delete(el)
    const released = identity.release(el)
    if (released === null) return
    if (released.gone) {
      ports.emit({ kind: "gone", key: released.key, t: now })
      return
    }
    const survivor = identity
      .custodyOf(released.key)
      .find((t) => t.role === "anchor" && t.el.isConnected)
    if (survivor !== undefined) {
      lastEmitted.delete(survivor.el)
      observe(survivor.el)
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
      const cls = classifyNode(el, cardSurface(el), ports.table)
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
      // The budget first: a card observe() leaves pending (vendor churn)
      // must still run out.
      if (now - since >= RESOLVE_BUDGET_MS) {
        channelPending.delete(el)
        channelAbandoned.add(el)
        const key = identity.keyOf(el)
        if (key !== null) {
          ports.onFact({ kind: "channel.abandoned", videoId: keyVideoId(key) })
        }
      } else if (tryExtract(el).kind === "full") {
        observe(el)
      }
    }

    for (const [el, { since, name, title }] of namePending) {
      if (!el.isConnected || now - since >= RESOLVE_BUDGET_MS) {
        namePending.delete(el)
        nameAbandoned.add(el)
      } else if (
        (name && extractMeta(el).channelName !== null) ||
        (title && extractTitle(el) !== null)
      ) {
        observe(el)
      }
    }

    for (const [el, since] of datePending) {
      if (!el.isConnected || now - since >= RESOLVE_BUDGET_MS) {
        datePending.delete(el)
        dateAbandoned.add(el)
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
    // by stop(). Not tied to visibility: every entry is under a wall-clock
    // budget, so the loop ends on its own in a hidden tab too.
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

  function watchWaiting(): boolean {
    return (
      watchSince !== null &&
      ports.clock() - watchSince.since < RESOLVE_BUDGET_MS
    )
  }

  function maybeStopRetryLoop(): void {
    if (
      queue.size === 0 &&
      channelPending.size === 0 &&
      namePending.size === 0 &&
      datePending.size === 0 &&
      !watchWaiting() &&
      retryTimer !== null
    ) {
      clearInterval(retryTimer)
      retryTimer = null
    }
  }

  // ── The page's own video (#1805) ───────────────────────────────────────

  /** Announce the page's own video when what is read of it changes. */
  function observeWatch(): void {
    if (!running) return
    const now = ports.clock()
    const watch = readWatch(ports.doc)
    if (watch !== null && !watch.short) {
      if (watchSince?.videoId !== watch.videoId) {
        watchSince = { videoId: watch.videoId, since: now }
      }
      if (watchWaiting()) ensureRetryLoop()
    } else {
      watchSince = null
    }
    const serialized = JSON.stringify(watch)
    if (serialized !== lastWatch) {
      lastWatch = serialized
      ports.emit({ kind: "watched", watch, t: now })
    }
    const el = readDescription(ports.doc)
    const offered =
      (el?.querySelector(`[${FACE_CONTROL_ATTRIBUTE}]`) ?? null) !== null
    if (el !== lastDescription.el || offered !== lastDescription.offered) {
      lastDescription = { el, offered }
      ports.emit({ kind: "described", t: now })
    }
  }

  // ── Mutation and navigation ────────────────────────────────────────────

  function onMutations(mutations: ReadonlyArray<MutationRecord>): void {
    const candidates = new Set<HTMLElement>()
    // Cards whose subtree changed go first: a cell recycled into a lockup
    // for the same video must release its key before the lockup asks for
    // it (#1504).
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

    enclosing.forEach((el) => observe(el))
    candidates.forEach((el) => {
      if (!enclosing.has(el)) observe(el)
    })
    retry()
    if (removed) prune()
    observeWatch()
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

  /**
   * An autoplay into a video Core does not admit is held (#1805, QD11).
   * YouTube's `yt-navigate` is not cancelable, but it is dispatched before
   * the app's own listener sees it, so stopping it here, in the capture
   * phase on the window, keeps the page where it is. The one vendor event
   * the Sensor holds, and only on Core's answer; a navigation the owner
   * starts carries no `autonav`, and is never held.
   */
  function onYtNavigate(event: Event): void {
    const next = readAutonav(event)
    if (next !== null && !ports.admits(next)) event.stopImmediatePropagation()
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
    channelAbandoned = new WeakSet()
    namePending.clear()
    nameAbandoned = new WeakSet()
    datePending.clear()
    dateAbandoned = new WeakSet()
    unknownReported = new WeakSet()
    lastEmitted.clear()
    if (retryTimer !== null) {
      clearInterval(retryTimer)
      retryTimer = null
    }
  }

  function scan(): void {
    if (!running) return
    ports.doc.querySelectorAll<HTMLElement>(SEL).forEach((el) => observe(el))
    observeWatch()
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
        // `video-id`: the watch page's video changing (#1805), which can
        // come before anything else on the page does; and the miniplayer
        // opening or closing, which need not come with a navigation.
        attributeFilter: ["data-video-id", "video-id", "miniplayer-is-active"],
      })
      ports.win.addEventListener("yt-navigate-finish", onNavigate)
      ports.win.addEventListener("yt-navigate", onYtNavigate, true)
    },

    stop(): void {
      if (!running) return
      running = false
      observer?.disconnect()
      observer = null
      ports.win.removeEventListener("yt-navigate-finish", onNavigate)
      ports.win.removeEventListener("yt-navigate", onYtNavigate, true)
      if (navDebounce !== null) {
        clearTimeout(navDebounce)
        navDebounce = null
      }
      forget()
      // Core forgets the page's video on `stop`, not on `nav` (R8).
      lastWatch = NO_WATCH
      watchSince = null
      lastDescription = { el: null, offered: false }
    },

    scan,

    custodyOf(key: CardKey): ReadonlyArray<CustodyTarget> {
      return identity.custodyOf(key)
    },

    description(): HTMLElement | null {
      return readDescription(ports.doc)
    },

    census(): SensorCensus {
      const occluded = occludedElements(ports.doc, engine)
      let untracked = 0
      for (const el of occluded) {
        if (identity.keyOf(el) === null && !queue.has(el)) untracked += 1
      }
      return {
        unresolved: queue.entries(),
        channelPending: [...channelPending].map(([el, firstSeenAt]) => ({
          el,
          firstSeenAt,
        })),
        occluded,
        occludedUntracked: untracked,
      }
    },

    get queued(): number {
      return queue.size
    },

    get running(): boolean {
      return running
    },
  }
}
