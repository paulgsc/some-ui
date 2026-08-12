/**
 * VideoManager — per-session registry.
 *
 * Lifecycle phases (typestate-lite):
 *
 *   "idle"    — constructed, or after reset().  No observers, no entries.
 *   "running" — after startSession().  Accepts upserts, retries, events.
 *
 * Invariants:
 *
 *   M1 — Phase gate.  upsert() and scan() are guarded: no-ops while idle.
 *        This makes double-setup detectable as a deterministic error rather
 *        than silent duplicate state.
 *
 *   M2 — Upsert idempotence.  For a given (el, videoId) pair:
 *        calling upsert(el) N times produces the same entry as calling it once.
 *        Achieved by the existing-entry repair path in _promote().
 *
 *   M3 — reset() is total.  Every VideoEntry is destroyed.  Every map is cleared.
 *        After reset(), size === 0 and no boyo artifacts remain in the DOM.
 *
 *   M4 — No ghost entries.  retryUnresolved() evicts elements that left the DOM
 *        (!el.isConnected).  prune() evicts resolved entries whose elements
 *        disconnected.
 *
 *   M5 — Session monotonicity.  _session only advances in startSession() and
 *        reset().  It is NEVER bumped mid-operation — doing so would silently
 *        cancel all concurrent async promotes.
 */

import { ext } from "@censor/platform/content"
import type { EntryDebugInfo } from "@censor/types/debug"
import type { ChannelId, VideoId } from "@censor/types/ids"
import { asVideoId } from "@censor/types/ids"
import type { SessionId } from "@some-extension/common"
import { mkSession } from "@some-extension/common"

import { publish, registerDebugSource } from "./debug"
import { tryExtract } from "./extract/index"
import { makeProvisionalRecord, makeRecord } from "./record"
import { isVideoCard, SEL } from "./selectors"
import { VideoEntry } from "./video-entry"

type Phase = "idle" | "running"

/**
 * How long an element gets to resolve before it is dropped.
 *
 * Both queues need a bound for the same reason (#973): the tags added for the
 * newer feeds are polymorphic. `yt-lockup-view-model` also renders channels and
 * playlists, which have no videoId and would sit in `_unresolved` forever; a
 * shorts lockup has a videoId but frequently no channel link at all, so it
 * would sit in `_channelPending` forever. Either one alone is enough to keep a
 * 500ms interval — and the full-document `scan()` it drives — running for the
 * lifetime of the tab (Charter §8).
 *
 * The budget is wall-clock, not a pass count. `retryUnresolved()` is driven by
 * the observer on every mutation batch as well as by the 500ms interval, so a
 * pass count is really a count of *page activity*: instrumenting a fixture
 * showed 15 passes inside the first four seconds, almost all of them from the
 * mount burst. A 20-pass budget therefore expired in a fraction of the ~10s it
 * was documented as granting, and would expire faster still on a busy feed —
 * exactly when a slow card most needs the time.
 */
const RESOLVE_BUDGET_MS = 10_000

export class VideoManager {
  // Primary lookup: videoId → entry
  private readonly _byVideo: Map<VideoId, VideoEntry> = new Map()
  // Element → videoId: detects scroll-virtualizer element reuse
  private readonly _elToVid: WeakMap<HTMLElement, VideoId> = new WeakMap()
  // Failed-resolution queue
  private readonly _unresolved: Map<string, HTMLElement> = new Map()
  // When each queued key was first seen, keyed alongside _unresolved /
  // _channelPending. The budget is measured from here; see RESOLVE_BUDGET_MS.
  private readonly _firstSeen: Map<string, number> = new Map()
  // Elements whose budget is spent. Without this, giving up is not sticky: the
  // retry loop calls scan(), scan() re-upserts every matching element, and a
  // re-queued element starts a fresh budget — so the queue would empty and
  // immediately refill, forever.
  //
  // Strong refs, unlike the WeakSet this started as, because `recheckRejected`
  // has to iterate them. Bounded by the number of non-video lockups on one
  // page, pruned as they disconnect, and cleared by reset() on every
  // navigation.
  private readonly _rejected: Set<HTMLElement> = new Set()
  // Same, for channel backfill: videoIds we have stopped looking for a channel
  // for. Keyed by videoId (not element) because that is what _channelPending is
  // keyed by, and cleared on reset() since a new session re-derives entries.
  private readonly _channelGaveUp: Set<VideoId> = new Set()
  // Mounted-but-channel-pending: videoId → element.  These entries are already
  // masked in the DOM; the retry loop backfills their channelId.  Tracked
  // separately from _unresolved (which is "not even maskable yet") so the retry
  // loop stays alive while either set is non-empty.
  private readonly _channelPending: Map<VideoId, HTMLElement> = new Map()
  // Concurrent-promotion guard
  private readonly _promoting: WeakSet<HTMLElement> = new WeakSet()

  private _phase: Phase = "idle"
  private _session: SessionId = mkSession()
  private _retryInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    // Register with the debug layer so Playwright can observe state
    this._registerDebug()
  }

  private _registerDebug(): void {
    // Use a closure that reads live state so snapshots are always fresh
    const mgr = this
    registerDebugSource({
      get phase(): Phase {
        return mgr._phase
      },
      get size(): number {
        return mgr._byVideo.size
      },
      get unresolvedSize(): number {
        return mgr._unresolved.size
      },
      get sessionOrdinal(): number {
        return mgr._session
      },
      entryInfos(): ReadonlyArray<EntryDebugInfo> {
        const out: Array<EntryDebugInfo> = []
        for (const [videoId, entry] of mgr._byVideo) {
          out.push({
            videoId,
            channelId: entry.record.channelId,
            viewKind: entry.viewKind,
            isConnected: entry.isConnected,
          })
        }
        return out
      },
    })
  }

  // ── Phase management ──────────────────────────────────────────────────────

  /**
   * Transition to "running" with a new session.
   * Throws if already running — callers must reset() first.
   */
  startSession(): SessionId {
    if (this._phase === "running") {
      throw new Error(
        "[BOYO] Invariant violated: startSession() called while already running. " +
          "Call reset() first."
      )
    }
    this._session = mkSession()
    this._phase = "running"
    publish()
    return this._session
  }

  /**
   * Total reset — destroy all entries, clear all maps, return to idle.
   */
  reset(): void {
    for (const entry of this._byVideo.values()) entry.destroy()
    this._byVideo.clear()
    this._unresolved.clear()
    this._channelPending.clear()
    this._firstSeen.clear()
    this._rejected.clear()
    this._channelGaveUp.clear()

    if (this._retryInterval !== null) {
      clearInterval(this._retryInterval)
      this._retryInterval = null
    }

    this._phase = "idle"
    publish()
  }

  get size(): number {
    return this._byVideo.size
  }

  get unresolvedSize(): number {
    return this._unresolved.size
  }

  // ── Public API ────────────────────────────────────────────────────────────

  upsert(el: HTMLElement): void {
    if (this._phase !== "running") return

    // A `yt-lockup-view-model` matched by SEL may currently be a channel, a
    // playlist, or a shell YouTube has not filled in yet. Extraction would scan
    // every anchor in its subtree to conclude nothing, on every pass, for every
    // such tile on the page — so the cheap structural check runs first and the
    // element goes straight onto the (bounded) retry queue instead. If it later
    // hydrates into a video lockup, the retry loop picks it up there.
    if (!isVideoCard(el)) {
      this._enqueueUnresolved(el)
      return
    }

    const extracted = tryExtract(el)

    if (extracted.kind === "full" || extracted.kind === "video-only") {
      this._dequeueUnresolved(elementKey(el))

      // Detect scroll-virtualizer element reuse: same HTMLElement, new videoId.
      // data-boyo-vid is set at mount time and cleared at destroy().
      // When it differs from the just-extracted id, the element has been recycled
      // for a different video — destroy the old entry eagerly so _promote() sees
      // a clean slate.  Do NOT bump _session: element recycling is a per-card
      // event, not a lifecycle boundary.  Bumping _session would silently cancel
      // all concurrent in-flight promotes for every other card on the page.
      const rawPreviousId = el.dataset["boyoVid"]
      const currentId = extracted.videoId

      if (rawPreviousId && rawPreviousId !== currentId) {
        const rawAsPrevId = asVideoId(rawPreviousId)
        const oldEntry = this._byVideo.get(rawAsPrevId)
        if (oldEntry) {
          oldEntry.destroy()
          this._byVideo.delete(rawAsPrevId)
          this._dropChannelPending(rawAsPrevId)
        }
      }

      if (extracted.kind === "full") {
        // Full resolution: if a provisional entry exists, backfill it rather
        // than tearing it down (avoids a mask flicker on the fast path).
        const pending = this._byVideo.get(currentId)
        if (pending && !pending.hasChannel) {
          this._dropChannelPending(currentId)
          void this._backfill(pending, extracted.channelId)
        } else {
          void this._promote(el, currentId, extracted.channelId)
        }
      } else {
        // video-only: mask immediately, queue channel backfill.
        this._promoteProvisional(el, currentId)
      }
      this._maybeStopRetryLoop()
    } else {
      this._enqueueUnresolved(el)
    }
  }

  /**
   * Queue an element for a later resolution attempt, under the shared budget.
   *
   * Re-queuing an element that is already queued keeps its existing attempt
   * count — otherwise a card the observer happens to touch every batch would
   * have its budget reset forever and the bound would not bind.
   */
  private _enqueueUnresolved(el: HTMLElement): void {
    if (this._rejected.has(el)) return
    const key = elementKey(el)
    this._startBudget(key)
    const wasEmpty = this._unresolved.size === 0
    this._unresolved.set(key, el)
    if (wasEmpty) this._ensureRetryLoop()
  }

  private _dequeueUnresolved(key: string): void {
    this._unresolved.delete(key)
    this._firstSeen.delete(key)
  }

  /** Start `key`'s clock, unless it is already running. */
  private _startBudget(key: string): void {
    if (!this._firstSeen.has(key)) this._firstSeen.set(key, Date.now())
  }

  /** Has `key` been waiting longer than {@link RESOLVE_BUDGET_MS}? */
  private _budgetSpent(key: string): boolean {
    const since = this._firstSeen.get(key)
    if (since === undefined) {
      this._firstSeen.set(key, Date.now())
      return false
    }
    return Date.now() - since >= RESOLVE_BUDGET_MS
  }

  /**
   * Re-examine elements we gave up on, in case one has since become a video.
   *
   * Rejection has to be revocable, because it interacts with the static
   * pre-mask rule. That rule occludes a lockup as soon as it contains a video
   * link, and only the content script writing data-boyo lifts it. So a shell we
   * rejected while it was link-less, which then hydrates into a real video
   * lockup, would be occluded with nothing coming to un-occlude it — a
   * permanently blurred card, which is the very failure the `:has()` guard
   * exists to prevent.
   *
   * The observer cannot notice that transition on its own: the link is added
   * deep inside the lockup, so neither the added node nor its descendants match
   * SEL, and re-deriving the enclosing card with `closest()` would mean walking
   * the tree on every mutation YouTube's player makes. Iterating the rejected
   * set instead costs one `querySelector` per rejected element — bounded by the
   * number of non-video lockups on the page, not by mutation volume — and the
   * set is usually empty, in which case this returns immediately.
   */
  recheckRejected(): void {
    if (this._phase !== "running" || this._rejected.size === 0) return

    for (const el of this._rejected) {
      if (!el.isConnected) {
        this._rejected.delete(el)
        continue
      }
      if (!isVideoCard(el)) continue
      // It is a video now. Clear the rejection and let the normal path run;
      // upsert() re-queues under a fresh budget if extraction still fails, and
      // a video-shaped element is exempt from the budget anyway.
      this._rejected.delete(el)
      this._firstSeen.delete(elementKey(el))
      this.upsert(el)
    }
  }

  /**
   * Re-scan the full DOM for renderer elements and upsert them all.
   *
   * Called after yt-navigate-finish (via the observer) to catch already-hydrated
   * cards whose data-video-id was pre-set before our MutationObserver batch ran.
   * Those cards produce no attribute mutation and would otherwise be missed until
   * the next scroll event triggers a childList mutation.
   */
  scan(): void {
    if (this._phase !== "running") return
    document.querySelectorAll<HTMLElement>(SEL).forEach((el) => this.upsert(el))
  }

  retryUnresolved(): void {
    // Dropping an entry changes `unresolved`, which the debug layer publishes
    // and the e2e suite polls. Without this the snapshot reports a queue that
    // drained several seconds earlier, because nothing else on these paths
    // publishes — the observable state and the real state disagree exactly
    // when a test is trying to prove the queue converged.
    let changed = false

    for (const [key, el] of this._unresolved) {
      if (!el.isConnected) {
        this._dequeueUnresolved(key)
        changed = true
        continue
      }
      const extracted = isVideoCard(el)
        ? tryExtract(el)
        : ({ kind: "raw", videoId: null, channelId: null } as const)
      if (extracted.kind === "full") {
        this._dequeueUnresolved(key)
        void this._promote(el, extracted.videoId, extracted.channelId)
      } else if (extracted.kind === "video-only") {
        // Maskable now — mount provisionally; channel resolves on a later pass.
        this._dequeueUnresolved(key)
        this._promoteProvisional(el, extracted.videoId)
      } else if (!isVideoCard(el) && this._budgetSpent(key)) {
        // Out of budget, and still not video-shaped: a channel or playlist
        // lockup. Give up on it for good. This is safe precisely because it is
        // not video-shaped — the pre-mask rule's `:has()` guard means the
        // stylesheet is not occluding it either, so nothing is left blurred
        // behind us.
        //
        // A *video-shaped* element is deliberately exempt from the budget: the
        // stylesheet IS occluding it, so giving up would leave it blurred with
        // nothing coming to lift the blur. In practice it cannot spin either —
        // being video-shaped means it has a watch or shorts href, which is the
        // very thing extractVideoId reads.
        this._dequeueUnresolved(key)
        this._rejected.add(el)
        changed = true
      }
    }

    // Backfill channel for already-masked provisional entries.
    for (const [videoId, el] of this._channelPending) {
      if (!el.isConnected) {
        this._dropChannelPending(videoId)
        changed = true
        continue
      }
      const extracted = tryExtract(el)
      if (extracted.kind === "full") {
        this._dropChannelPending(videoId)
        const entry = this._byVideo.get(videoId)
        if (entry) void this._backfill(entry, extracted.channelId)
      } else if (this._budgetSpent(channelKey(videoId))) {
        // No channel is coming (a shorts lockup exposes none). The entry stays
        // mounted and masked — masking only ever needed the videoId. It simply
        // never participates in channel whitelisting, which is correct: we do
        // not know whose channel it is.
        this._dropChannelPending(videoId)
        this._channelGaveUp.add(videoId)
        changed = true
      }
    }

    if (changed) publish()
    this._maybeStopRetryLoop()
  }

  /**
   * Queue a mounted entry for channel backfill, unless we have already spent
   * its budget. The guard is what makes give-up stick: `scan()` re-upserts
   * every card each pass, and a card with no channel takes the provisional
   * path again every time.
   */
  private _trackChannelPending(videoId: VideoId, el: HTMLElement): void {
    if (this._channelGaveUp.has(videoId)) return
    this._channelPending.set(videoId, el)
    this._ensureRetryLoop()
  }

  private _dropChannelPending(videoId: VideoId): void {
    this._channelPending.delete(videoId)
    this._firstSeen.delete(channelKey(videoId))
  }

  /**
   * Evict entries whose renderer elements are no longer connected to the DOM.
   *
   * Called from the observer on childList removals, and eagerly from the
   * yt-navigate-finish listener before the deferred scan().  Covers:
   *   - scroll-virtualizer evictions
   *   - SPA navigation DOM teardowns
   *   - bulk innerHTML replacements (single removedNodes entry in observer)
   */
  prune(): void {
    for (const [videoId, entry] of this._byVideo) {
      if (!entry.isConnected) {
        entry.destroy()
        this._byVideo.delete(videoId)
        this._dropChannelPending(videoId)
      }
    }
    publish()
  }

  handleClick(videoId: VideoId): void {
    this._byVideo.get(videoId)?.gate.rawClick()
  }

  handleDblClick(videoId: VideoId): void {
    this._byVideo.get(videoId)?.gate.rawDblClick()
  }

  async whitelistChannel(videoId: VideoId): Promise<void> {
    const entry = this._byVideo.get(videoId)
    if (!entry) return

    const channelName = entry.record.channelId // fallback is the id itself

    try {
      await ext.runtime.sendMessage({
        type: "ADD_WHITELIST",
        channelId: entry.record.channelId,
        channelName,
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[BOYO] whitelistChannel: sendMessage failed", err)
    }

    this._whitelistChannelLocally(entry.record.channelId)
  }

  applyWhitelistBroadcast(channelId: string): void {
    this._whitelistChannelLocally(channelId)
  }

  /**
   * Advance every masked or meta entry to TitleState in one operation.
   *
   * Called by the key-binding adapter (KeyBindingAdapater) on the configured
   * hotkey. Phase-gated and idempotent - safe to call repeatedly.
   */
  advanceAllToTitle(): void {
    if (this._phase !== "running") return
    for (const entry of this._byVideo.values()) {
      entry.advanceToTitle()
    }
    publish()
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async _promote(
    el: HTMLElement,
    videoId: VideoId,
    channelId: ChannelId
  ): Promise<void> {
    if (this._promoting.has(el)) return
    this._promoting.add(el)

    try {
      // Scroll-virtualizer reuse guard (second line of defence after upsert).
      const prevVid = this._elToVid.get(el)
      const session = this._session
      if (prevVid !== undefined && prevVid !== videoId) {
        this._byVideo.get(prevVid)?.destroy()
        this._byVideo.delete(prevVid)
      }

      // Same (el, videoId) in current session → veil repair only.
      const existing = this._byVideo.get(videoId)
      if (existing?.record.session === this._session) {
        existing.repair()
        return
      }

      // Stale entry (different session) or brand-new entry → replace.
      existing?.destroy()

      const isWhitelisted = await ext.runtime
        .sendMessage({ type: "IS_WHITELISTED", channelId: String(channelId) })
        .then((r: { ok: boolean; whitelisted: boolean }) => r.whitelisted)
        .catch(() => false)

      // Post-await guards: bail if the manager was torn down or a full
      // reset()+startSession() cycle ran while we were awaiting.
      if (this._phase !== "running") return
      if (this._session !== session) return

      const record = makeRecord(
        { kind: "full", videoId, channelId },
        this._session
      )
      this._elToVid.set(el, videoId)
      const entry = new VideoEntry(record, el, isWhitelisted)
      this._byVideo.set(videoId, entry)
      entry.mount()
      publish()
    } finally {
      this._promoting.delete(el)
    }
  }

  /**
   * Mount a card masked on videoId alone (channel pending).
   *
   * Synchronous and side-effect-light: no whitelist round-trip here (we have no
   * channel to check yet).  The card shows masked immediately — the whole point
   * of the extension is that nothing leaks before the user progresses, so a
   * whitelisted channel briefly showing masked until backfill is harmless.
   *
   * Idempotent: if an entry for this videoId already exists in this session,
   * we repair rather than replace.
   */
  private _promoteProvisional(el: HTMLElement, videoId: VideoId): void {
    const existing = this._byVideo.get(videoId)
    if (existing?.record.session === this._session) {
      existing.repair()
      if (!existing.hasChannel) this._trackChannelPending(videoId, el)
      return
    }
    existing?.destroy()

    const prevVid = this._elToVid.get(el)
    if (prevVid !== undefined && prevVid !== videoId) {
      this._byVideo.get(prevVid)?.destroy()
      this._byVideo.delete(prevVid)
      this._dropChannelPending(prevVid)
    }

    const record = makeProvisionalRecord(
      { kind: "video-only", videoId, channelId: null },
      this._session
    )
    this._elToVid.set(el, videoId)
    const entry = new VideoEntry(record, el, /* isWhitelisted */ false)
    this._byVideo.set(videoId, entry)
    this._trackChannelPending(videoId, el)
    entry.mount()
    publish()
  }

  /**
   * Backfill a concrete channelId onto a provisional entry, running the
   * whitelist check now that we have a channel to check.  Guarded against
   * lifecycle changes across the await.
   */
  private async _backfill(
    entry: VideoEntry,
    channelId: ChannelId
  ): Promise<void> {
    if (entry.hasChannel) return
    const session = this._session
    const isWhitelisted = await ext.runtime
      .sendMessage({ type: "IS_WHITELISTED", channelId: String(channelId) })
      .then((r: { ok: boolean; whitelisted: boolean }) => r.whitelisted)
      .catch(() => false)
    if (this._phase !== "running") return
    if (this._session !== session) return
    entry.backfillChannel(String(channelId), isWhitelisted)
    publish()
  }

  private _whitelistChannelLocally(channelId: string): void {
    for (const entry of this._byVideo.values()) {
      if (entry.record.channelId === channelId) {
        entry.dispatchWhitelist()
      }
    }
    publish()
  }

  private _ensureRetryLoop(): void {
    if (this._retryInterval !== null) return
    this._retryInterval = setInterval(() => {
      try {
        this.retryUnresolved()

        // lightweight reconciliation
        this.scan()
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[VideoManager] retry threw", err)
      }
    }, 500)
  }

  private _maybeStopRetryLoop(): void {
    if (
      this._unresolved.size === 0 &&
      this._channelPending.size === 0 &&
      this._retryInterval !== null
    ) {
      clearInterval(this._retryInterval)
      this._retryInterval = null
    }
  }
}

/**
 * Attempt-budget key for a channel backfill. Namespaced away from
 * elementKey()'s output so a videoId can never collide with an element key.
 */
function channelKey(videoId: VideoId): string {
  return `c:${videoId}`
}

function elementKey(el: HTMLElement): string {
  const vid = el.getAttribute("data-video-id")
  if (vid) return `v:${vid}`

  const a = el.querySelector<HTMLAnchorElement>(
    'a[href*="/watch"], a[href*="/shorts/"]'
  )
  if (a?.href) return `h:${a.href}`

  const p = el.parentElement
  if (p) return `p:${p.tagName}:${Array.from(p.children).indexOf(el)}`

  return `r:${Math.random()}`
}
