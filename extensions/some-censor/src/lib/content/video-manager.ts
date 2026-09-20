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
 *
 *   M6 — Per-element staleness (#980).  The same technique as VideoEntry's
 *        Entry-2 (`_version`, checked after an await), applied one level up:
 *        `_session` catches a *lifecycle* boundary (SPA navigation) but not a
 *        single element being recycled to a new video mid-await, which is a
 *        per-card event, not a session event. `_elClaim`'s token is bumped
 *        every time an element is newly claimed for a different videoId;
 *        `_promote()` and `_backfill()` capture it before their whitelist-
 *        check await and discard the resolution if it no longer matches —
 *        the element has moved on to a different video since the operation
 *        started. An intermediate videoId recycled through *during* another
 *        element's in-flight await (never seen long enough to mount) is
 *        silently dropped; only the element's *current* claim is guaranteed
 *        to eventually mount, via the stale-bail retry in `_promote()`.
 */

import { ext } from "@censor/platform/content"
import type { EntryDebugInfo } from "@censor/types/debug"
import type { ChannelId, VideoId } from "@censor/types/ids"
import { asVideoId } from "@censor/types/ids"
import type { SessionId } from "@some-extension/common"
import { mkSession } from "@some-extension/common"

import { publish, registerDebugSource } from "./debug"
import { representsVideo, tryExtract } from "./extract/index"
import {
  observability,
  OCCLUSION_GRACE_MS,
  PROMOTION_STALL_MS,
} from "./observability"
import type {
  BoyoContext,
  OccludedCard,
  PromotingCard,
  QueuedCard,
} from "./observability"
import { makeProvisionalRecord, makeRecord } from "./record"
import { isVideoCard, occludedElements, SEL } from "./selectors"
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
export const RESOLVE_BUDGET_MS = 10_000

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
  // Observability-only mirror of _promoting: when each element entered the
  // guard, so PromotionGuardClears (observability.ts) can see one that never
  // left it. A WeakSet cannot be iterated, and the invariant's whole subject
  // is the element still sitting in it — so this holds strong refs, the same
  // trade _rejected already makes and for the same reason.
  //
  // Deliberately exempt from reset()'s clear-everything sweep (M3), unlike
  // every other map here — bot-found (#1397's own review): reset() cannot
  // clear `_promoting` itself, because a WeakSet has no iteration and so no
  // clear-by-content. Clearing only the mirror would let the two disagree
  // exactly where it matters: an element still held by the real guard after
  // an SPA navigation blocks every later _promote() for it, and a mirror that
  // forgot it makes that permanently unreportable. Entries are therefore
  // removed in one place only — _promote()'s finally, the same place the real
  // guard is released — so the mirror can only ever retain what `_promoting`
  // has also retained, and what it retains is precisely the leak.
  private readonly _promotingSince: Map<HTMLElement, PromotingCard> = new Map()
  // Observability-only, like _promotingSince: when each element was first seen
  // under the static occluder with no data-boyo. Strong refs for the same
  // reason, and bounded the same way — _occlusionCensus() prunes it against
  // the live DOM on every pass, so it holds at most what is on screen.
  private readonly _occludedSince: Map<HTMLElement, number> = new Map()
  // Per-element staleness guard (#980, M6). Which videoId an element is
  // currently claimed for, and a token bumped whenever that claim changes —
  // set synchronously the instant _promote()/_promoteProvisional() start
  // handling el, independent of _elToVid, which is only stamped *after* a
  // promotion succeeds and so cannot see a recycle that happens during the
  // very first in-flight promotion for that element. _promote()/_backfill()
  // capture the token before their whitelist-check await and compare after,
  // the same technique as VideoEntry's `_version`.
  private readonly _elClaim: WeakMap<
    HTMLElement,
    { videoId: VideoId; token: number }
  > = new WeakMap()
  private _tokenSeq = 0

  private _phase: Phase = "idle"
  private _session: SessionId = mkSession()
  private _retryInterval: ReturnType<typeof setInterval> | null = null
  // Observability-only. See _armStallWatch().
  private _stallWatch: ReturnType<typeof setTimeout> | null = null
  // Observability-only, and the same shape as _stallWatch. See
  // _armOcclusionWatch().
  private _occlusionWatch: ReturnType<typeof setTimeout> | null = null
  // Whether the previous occlusion reading found anything under the occluder.
  // See _occlusionReading(): it is what lets a clean page stay silent without
  // swallowing the one sample that says a page *became* clean.
  private _occludedLastReading = false

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
    if (this._promotingSince.size > 0) this._armStallWatch()
    this._armOcclusionWatch()
    observability()?.sessionStart(this._session)
    // Taken now, not promised. Round 3 seeded a flag so the *first tick* would
    // report regardless of what it found; bot-found in round 4 that a flag is
    // not a reading — navigation is debounced at 150 ms, so a second one
    // inside OCCLUSION_GRACE_MS runs `_teardownRuntime()` -> `reset()`, which
    // cancels the tick that was going to honour it. A verdict describing the
    // page before the navigation would then stay the latest persisted one.
    this._occlusionReading(Date.now(), /* force */ true)
    publish()
    return this._session
  }

  /**
   * Total reset — destroy all entries, clear all maps, return to idle.
   */
  reset(): void {
    observability()?.sessionReset(this._session)
    for (const entry of this._byVideo.values()) entry.destroy()
    this._byVideo.clear()
    this._unresolved.clear()
    this._channelPending.clear()
    this._firstSeen.clear()
    this._rejected.clear()
    this._channelGaveUp.clear()
    this._occludedSince.clear()
    this._occludedLastReading = false

    if (this._retryInterval !== null) {
      clearInterval(this._retryInterval)
      this._retryInterval = null
    }
    // Stopped here and re-armed by startSession() if anything is still held,
    // so a disabled extension leaves no timer running while a teardown/restart
    // cycle keeps watching a promotion that survived it.
    this._disarmStallWatch()
    this._disarmOcclusionWatch()

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
      // When it differs from the just-extracted id, the element has *either*
      // been recycled for a different video or had its subtree churned by the
      // vendor — `representsVideo` is what tells those apart (#1423).  Do NOT
      // bump _session either way: both are per-card events, not lifecycle
      // boundaries.  Bumping _session would silently cancel all concurrent
      // in-flight promotes for every other card on the page.
      const rawPreviousId = el.dataset["boyoVid"]
      const currentId = extracted.videoId

      let recycled = false
      if (rawPreviousId && rawPreviousId !== currentId) {
        const rawAsPrevId = asVideoId(rawPreviousId)
        // Three conditions, none of them optional, and each one is a P1 this
        // PR's review found by removing it (#1427, rounds 1-3):
        //
        //   - the entry is live in THIS session — otherwise the shortcut
        //     "preserves" something reset() already destroyed and returns
        //     without mounting (round 2);
        //   - the entry belongs to THIS element — `_byVideo` is keyed by
        //     video, so an id lookup alone can hand back another renderer's
        //     entry and repair that instead (round 3, #1426);
        //   - and the element still advertises the artifact, with an
        //     authoritative `data-video-id` outranking any stale descendant
        //     link (round 1).
        //
        // This is the only place the discrimination happens. `_promote()`
        // deliberately does not repeat it: its `_elToVid` claim survives
        // resets and names a video rather than an element, which is evidence
        // too weak to skip a mount on.
        const prevEntry = this._byVideo.get(rawAsPrevId)
        if (
          prevEntry?.record.session === this._session &&
          prevEntry.owns(el) &&
          representsVideo(el, rawAsPrevId)
        ) {
          // Vendor churn, not a recycle. The artifact we mounted is still here;
          // `currentId` is some other anchor that has come to sit earlier in
          // document order (a hover preview's own link, most often — which is
          // why this fires the instant a card is revealed and the cursor is
          // still on it). Tearing the entry down here would revoke the user's
          // own disclosure and drop the card back under the static occluder,
          // which takes no pointer events — so the card would go inert rather
          // than merely re-masked.
          //
          // repair() rather than nothing: the same churn may have taken our
          // veil with it, and repairing is idempotent for an entry that still
          // has one (and a no-op for a revealed entry, which has none by
          // design).
          prevEntry.repair()
          observability()?.churnIgnored(rawPreviousId)
          this._maybeStopRetryLoop()
          return
        }
        recycled = true
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
          void this._backfill(el, pending, extracted.channelId)
        } else if (recycled) {
          // A recycle has just stripped data-boyo off an element that is still
          // on screen, so the static occluder is covering it *right now* — and
          // `_promote()` would not lift that until a background round trip
          // answers, which is seconds on a cold MV3 worker. Mask synchronously
          // instead and resolve the channel afterwards: exactly the flow the
          // video-only path already uses, for the same stated reason — nothing
          // may leak before the user progresses, and a whitelisted channel
          // briefly showing masked is harmless.
          this._promoteProvisional(el, currentId)
          const fresh = this._byVideo.get(currentId)
          if (fresh) {
            this._dropChannelPending(currentId)
            void this._backfill(el, fresh, extracted.channelId)
          }
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
    // Recorded only on a genuinely new queue entry. The observer re-upserts a
    // card on every batch it touches, so recording each call would put one
    // event per mutation per card on the timeline and evict everything else.
    if (!this._unresolved.has(key)) observability()?.queued(key)
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
        observability()?.rejected(key)
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
        if (entry) void this._backfill(el, entry, extracted.channelId)
      } else if (this._budgetSpent(channelKey(videoId))) {
        // No channel is coming (a shorts lockup exposes none). The entry stays
        // mounted and masked — masking only ever needed the videoId. It simply
        // never participates in channel whitelisting, which is correct: we do
        // not know whose channel it is.
        this._dropChannelPending(videoId)
        this._channelGaveUp.add(videoId)
        observability()?.channelAbandoned(videoId)
        changed = true
      }
    }

    if (changed) publish()
    this._sampleHealth()
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
   *
   * ## What "all" means, and why it is now reported (#1424)
   *
   * It iterates `_byVideo`, which holds promoted entries only. A card still in
   * `_unresolved`, or one orphaned under the static occluder with no registry
   * slot at all (#1421), is outside this loop and always was — which is the
   * live report that the hotkey "misses some k% of cards", stable across
   * rebuilds because the causes are structural rather than racy.
   *
   * This does not widen the loop. Widening it is #1385's question, not this
   * one, and pulls the opposite way: `[QC3]` exists to give the command an
   * *admission predicate* so it stops advancing cards it should not. The two
   * compose because this change adds no eligibility of its own — it counts
   * what the loop did and what it never reached, so when `[QC3]` narrows the
   * set the command names, the same census reports honestly about the narrower
   * set with nothing to undo here.
   */
  advanceAllToTitle(): void {
    if (this._phase !== "running") return

    let advanced = 0
    let alreadyPast = 0
    let detached = 0
    let channelPending = 0
    for (const [videoId, entry] of this._byVideo) {
      const outcome = entry.advanceToTitle()
      if (outcome === "advanced") advanced += 1
      else if (outcome === "already-past") alreadyPast += 1
      else detached += 1
      // Counted for the entries the command actually reached, which is the
      // claim being evidenced — see BulkAdvanceCoverage.channelPending.
      if (outcome !== "detached" && this._channelPending.has(videoId)) {
        channelPending += 1
      }
    }

    const census = this._coverageCensus()
    observability()?.bulkAdvance({
      advanced,
      alreadyPast,
      detached,
      unresolved: census.unresolved,
      promoting: census.promoting,
      occludedUntracked: census.untracked,
      channelPending,
    })
    publish()
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /**
   * Claim `el` for `videoId`, bumping its staleness token (M6) only if the
   * claim actually changed, and returning the (possibly unchanged) token.
   * Idempotent re-upserts for the same video (M2) must not invalidate their
   * own in-flight promotion, so re-claiming the same videoId is a no-op.
   */
  private _claim(el: HTMLElement, videoId: VideoId): number {
    const current = this._elClaim.get(el)
    if (current?.videoId === videoId) return current.token
    const token = ++this._tokenSeq
    this._elClaim.set(el, { videoId, token })
    return token
  }

  /** `el`'s current staleness token, or `undefined` if never claimed. */
  private _tokenFor(el: HTMLElement): number | undefined {
    return this._elClaim.get(el)?.token
  }

  private async _promote(
    el: HTMLElement,
    videoId: VideoId,
    channelId: ChannelId
  ): Promise<void> {
    // Claimed before the re-entrancy check so a recycle that arrives while
    // another promotion is in flight still records the new claim, even
    // though _promoting blocks this call from doing anything else with it.
    const token = this._claim(el, videoId)
    if (this._promoting.has(el)) return
    this._promoting.add(el)
    this._promotingSince.set(el, { key: videoId, startedAt: Date.now() })
    this._armStallWatch()

    let stale = false
    let sessionEnded = false
    try {
      // Scroll-virtualizer reuse guard (second line of defence after upsert).
      const prevVid = this._elToVid.get(el)
      const session = this._session
      if (prevVid !== undefined && prevVid !== videoId) {
        // Deliberately NOT a churn/recycle decision — this destroys and
        // continues to mount, as it did before #1423.
        //
        // An earlier revision of this PR discriminated here too, and it
        // produced two separate P1s in consecutive review rounds (#1427,
        // rounds 2 and 3). Both had the same root cause: `_elToVid` is a
        // WeakMap `reset()` cannot clear and `_byVideo` is keyed by video
        // rather than by element, so `prevVid` here is not evidence about
        // *this* element at all — it can outlive a session, and the entry it
        // names can belong to a different renderer entirely. A shortcut that
        // returns without mounting on evidence that weak strands the element
        // under the static occluder, which is the failure this PR exists to
        // remove.
        //
        // The discrimination lives in upsert() alone, keyed on
        // `data-boyo-vid` — a stamp on the element itself, so it cannot
        // implicate another renderer. This path is only ever reached after
        // upsert() has already decided, or from retryUnresolved() for an
        // element that was never mounted, so nothing is lost by it being the
        // plain teardown it always was.
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

      // Post-await guards: bail if the manager was torn down, a full
      // reset()+startSession() cycle ran while we were awaiting (M5), or el
      // has since been claimed for a different videoId (M6/#980) — the
      // element was recycled one or more times during this round-trip and no
      // longer means what it meant when the operation started.
      if (this._phase !== "running") return
      if (this._session !== session) {
        // C2: a chip/feed navigation tore the runtime down and started a
        // fresh session while this call awaited. _promoting is a WeakSet
        // reset() cannot clear (see its own comment), so el stayed claimed by
        // this call for the entire round-trip — including through the new
        // session's own _scan(), whose upsert() for the very same el (chip
        // navigations reuse renderer elements in place) had nothing to do but
        // return at the guard above. That upsert has no other way to be
        // retried once the guard clears: without requeuing here, el is
        // silently orphaned — not promoting, never promoted, and still
        // hidden under the static pre-mask rule with nothing left to lift it.
        sessionEnded = true
        return
      }
      if (this._tokenFor(el) !== token) {
        stale = true
        return
      }

      const record = makeRecord(
        { kind: "full", videoId, channelId },
        this._session
      )
      this._elToVid.set(el, videoId)
      const entry = new VideoEntry(record, el, isWhitelisted)
      this._byVideo.set(videoId, entry)
      entry.mount()
      observability()?.mountResolved(videoId)
      publish()
    } finally {
      this._promoting.delete(el)
      this._promotingSince.delete(el)
      if (stale) observability()?.staleDiscarded(videoId)
      // A stale bail means el moved on while this call was in flight; a
      // sessionEnded bail means a navigation reset the runtime while it was
      // in flight. Either way, re-derive el's *current* truth from the live
      // DOM now that the guard has cleared, rather than trying to carry a
      // videoId or a session forward through an already-superseded call.
      // Safe from looping: this only re-enters when el actually changed or a
      // navigation actually happened since this call started, and each of
      // those can trigger at most one such retry.
      if ((stale || sessionEnded) && el.isConnected) this.upsert(el)
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
    // Claim el for videoId (M6/#980) so any *other* in-flight _promote()/
    // _backfill() call for this element — still awaiting from an earlier,
    // now-superseded videoId — sees the mismatch once it resumes.
    this._claim(el, videoId)

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
    observability()?.mountProvisional(videoId)
    publish()
  }

  /**
   * Backfill a concrete channelId onto a provisional entry, running the
   * whitelist check now that we have a channel to check.  Guarded against
   * lifecycle changes across the await (M5) and against `el` having been
   * recycled to a different video while this call was in flight (M6/#980) —
   * unlike _promote(), a stale bail here needs no retry of its own: whatever
   * recycled `el` already routed it through a fresh _promote()/
   * _promoteProvisional() synchronously, so `entry` is simply no longer the
   * live entry for `el` and backfilling it would write into a corpse.
   */
  private async _backfill(
    el: HTMLElement,
    entry: VideoEntry,
    channelId: ChannelId
  ): Promise<void> {
    if (entry.hasChannel) return
    const token = this._claim(el, asVideoId(entry.record.videoId))
    const session = this._session
    const isWhitelisted = await ext.runtime
      .sendMessage({ type: "IS_WHITELISTED", channelId: String(channelId) })
      .then((r: { ok: boolean; whitelisted: boolean }) => r.whitelisted)
      .catch(() => false)
    if (this._phase !== "running") return
    if (this._session !== session) return
    if (this._tokenFor(el) !== token) return
    entry.backfillChannel(String(channelId), isWhitelisted)
    observability()?.channelBackfilled(String(entry.record.videoId))
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

  /**
   * Hand the live queue census to the observability layer, at that layer's
   * own cadence rather than this loop's.
   *
   * Called from `retryUnresolved()` because that is the only periodic thing
   * this class already runs — adding a second timer for diagnostics would be
   * exactly the per-tab background cost Charter §8 (and `RESOLVE_BUDGET_MS`'s
   * own rationale) is about. `shouldSampleHealth` is a single timestamp
   * comparison, so the 500 ms passes that are not due cost nothing and the
   * context below is not built at all.
   */
  private _sampleHealth(): void {
    const obs = observability()
    if (!obs) return
    const now = Date.now()
    if (!obs.shouldSampleHealth(now)) return
    void obs.sampleHealth(this._observabilityContext(now))
  }

  /**
   * The live queue state, as plain data. Read-only with respect to every map
   * it touches: this reports what the manager already decided, it never gates
   * or alters a decision (#1395's own non-goal).
   */
  private _observabilityContext(now: number): BoyoContext {
    const unresolved: Array<QueuedCard> = []
    for (const [key, el] of this._unresolved) {
      unresolved.push({
        key,
        firstSeenAt: this._firstSeen.get(key) ?? now,
        // Re-read from the live DOM rather than trusting why the element was
        // queued: a lockup hydrates from the inside out, so the answer at
        // enqueue time and the answer now are different questions — and it is
        // the answer *now* that decides whether the pre-mask rule is still
        // occluding it.
        videoShaped: isVideoCard(el),
      })
    }

    const channelPending: Array<QueuedCard> = []
    for (const videoId of this._channelPending.keys()) {
      const key = channelKey(videoId)
      channelPending.push({
        key,
        firstSeenAt: this._firstSeen.get(key) ?? now,
        // Already mounted and masked, so the pre-mask rule is no longer what
        // is covering it — the field is about occlusion, and does not apply.
        videoShaped: false,
      })
    }

    return {
      now,
      phase: this._phase,
      resolveBudgetMs: RESOLVE_BUDGET_MS,
      unresolved,
      channelPending,
      promoting: [...this._promotingSince.values()],
      occluded: this._occlusionCensus(now),
    }
  }

  /**
   * What the static occluder is hiding right now, and since when.
   *
   * The one part of this context read from the DOM rather than from a map
   * here. Every queue above can only describe an element this class is still
   * tracking; the failures `OccluderReleases` exists for are the ones where an
   * element fell out of all of them (#1421), so the census has to ask the page
   * instead of asking us.
   *
   * `_occludedSince` is the only state it needs — first-seen timestamps so a
   * card legitimately mid-adoption is not reported as stranded. It is pruned
   * against the live answer on every pass, so it is bounded by what is on
   * screen rather than by session length, and cleared by reset() with
   * everything else.
   *
   * Cost is one `querySelectorAll` per premask selector per *health sample*
   * (10 s), not per mutation — the Charter §8 line the rest of this layer is
   * built around.
   */
  private _occlusionCensus(now: number): Array<OccludedCard> {
    const census: Array<OccludedCard> = []
    const live = new Set<HTMLElement>()

    for (const el of occludedElements(document)) {
      live.add(el)
      let sinceAt = this._occludedSince.get(el)
      if (sinceAt === undefined) {
        sinceAt = now
        this._occludedSince.set(el, sinceAt)
      }
      census.push({ tag: el.tagName.toLowerCase(), sinceAt })
    }

    for (const el of this._occludedSince.keys()) {
      if (!live.has(el)) this._occludedSince.delete(el)
    }

    return census
  }

  /**
   * The cards the static occluder is hiding right now, attributed to why.
   *
   * ## Why this partitions the occluded set rather than the queues
   *
   * Bot-found on #1429's own review, twice, and both findings were the same
   * mistake: buckets derived from the bookkeeping do not mean what their
   * labels say.
   *
   * `_unresolved.size` is not "cards the command missed". `upsert()` enqueues
   * every element that fails `isVideoCard()` — a channel lockup, a playlist,
   * an unhydrated shell — precisely so extraction does not rescan their
   * subtrees each pass. Those are not cards, and the premask `:has()` guard
   * deliberately does not occlude them, so the user sees them perfectly well.
   * Counting them inflated `skipped` with ordinary tiles, worst on search
   * pages where polymorphic lockups are most of the grid (P1).
   *
   * And "occluded minus the queue" is not "orphaned". `_promote()` dequeues
   * before awaiting the `IS_WHITELISTED` round trip, so for the length of that
   * trip a perfectly healthy card is occluded, out of `_unresolved`, and
   * inside `_promoting` — landing in the bucket documented as structural
   * orphans, which is the one bucket whose whole value is that it should trend
   * to zero as #1421 lands (P2).
   *
   * So the census starts from what the user can actually see — the occluder's
   * own condition — and asks of each hidden card *why*. Every bucket then
   * means one thing: `unresolved` is mid-resolution, `promoting` is mid-mount,
   * `untracked` is nothing coming for it. A tile that is not occluded is not
   * in any of them, because it was never missed.
   *
   * Reads the DOM without touching `_occludedSince`. That map belongs to the
   * health cadence, and its timestamps are what `OccluderReleases` measures
   * its grace window from; letting a user keystroke seed entries would make
   * how often someone presses the hotkey an input to whether a stranded card
   * is reported. A count needs no timestamps, so it takes none.
   */
  private _coverageCensus(): {
    unresolved: number
    promoting: number
    untracked: number
  } {
    const queued = new Set<HTMLElement>(this._unresolved.values())
    let unresolved = 0
    let promoting = 0
    let untracked = 0

    for (const el of occludedElements(document)) {
      if (queued.has(el)) unresolved += 1
      else if (this._promoting.has(el)) promoting += 1
      else untracked += 1
    }

    return { unresolved, promoting, untracked }
  }

  /**
   * Keep a health cadence alive for as long as anything is inside the
   * promotion guard.
   *
   * Bot-found (#1397's own review). `_sampleHealth()` rides `retryUnresolved()`,
   * which runs only from the observer's mutation batches and from the retry
   * interval — and that interval is started by the two *queueing* paths alone.
   * A fully-extracted card never queues, so a page whose only work item is one
   * such card leaves no periodic callback running at all. A never-settling
   * `IS_WHITELISTED` promise could then cross `PROMOTION_STALL_MS` on a quiet
   * page without `PromotionGuardClears` ever being evaluated — the invariant
   * missing precisely the failure it was added for.
   *
   * Deliberately not solved by keeping `_ensureRetryLoop()` alive instead:
   * that loop drives a full-document `scan()` every 500 ms, which would make
   * a diagnostic concern pay a masking-sized cost (Charter §8). This is one
   * shared one-shot, re-armed only while something is actually held, that
   * touches nothing but the recorder. Promotions normally settle in
   * milliseconds, so on any healthy page it fires once, finds an empty map,
   * and stops.
   */
  private _armStallWatch(): void {
    if (this._stallWatch !== null) return
    this._stallWatch = setTimeout(() => {
      this._stallWatch = null
      if (this._promotingSince.size === 0) return
      // Bypasses _sampleHealth()'s throttle: this fires at the stall
      // threshold's own period, which is far slower than that throttle, and a
      // sample skipped here is the one that had something to report.
      const obs = observability()
      if (obs) void obs.sampleHealth(this._observabilityContext(Date.now()))
      this._armStallWatch()
    }, PROMOTION_STALL_MS)
  }

  private _disarmStallWatch(): void {
    if (this._stallWatch !== null) {
      clearTimeout(this._stallWatch)
      this._stallWatch = null
    }
  }

  /**
   * Look at the page for stranded cards on a fixed cadence, for as long as a
   * session is running.
   *
   * ## Why a standing cadence and not a conditional one
   *
   * Bot-found twice on this PR's own review, and the second finding is what
   * decided the shape. Both were the same defect: the place that scheduled the
   * next look sat behind a gate the orphan population cannot pass.
   *
   * Round 1 — `_sampleHealth()` rides `retryUnresolved()`, whose interval is
   * kept alive by `_unresolved` and `_channelPending` alone, and
   * `_armStallWatch()` covers only `_promotingSince`. An element this class
   * never adopted is in none of them, so it keeps nothing running: one sample
   * stamps its `sinceAt`, `now - sinceAt` is zero, and `OccluderReleases`
   * reports healthy forever.
   *
   * Round 2 — arming from inside `_occlusionCensus()` moved the gate rather
   * than removing it. `_sampleHealth()` consults `shouldSampleHealth()` and
   * returns *before* building a context, so a card stranded within
   * `HEALTH_SAMPLE_INTERVAL_MS` of the previous sample produced no census and
   * therefore no watch. Worse across an SPA navigation: `startObservability()`
   * runs once per content-script instance and deliberately outlives a session
   * (see observability.ts's header), so a new session inherited the old one's
   * `_lastHealthAt` — the `sessionStart()` reset below closes that half.
   *
   * Making the cadence conditional means enumerating every path by which an
   * element can end up occluded and unadopted. This epic exists because that
   * enumeration is exactly what nobody can do reliably — `destroy()` dropping
   * `data-boyo` is not even an observer signal (#1423), and #1426 is a card
   * whose *second* tracked element no path accounts for. An invariant whose
   * whole point is to read the DOM rather than trust the bookkeeping cannot
   * have its schedule depend on the bookkeeping's call graph.
   *
   * ## What it costs
   *
   * A `setTimeout` chain at `OCCLUSION_GRACE_MS` — 30x less often than the
   * retry loop's 500 ms, and each tick is `PREMASK_SELECTORS.length`
   * read-only `querySelectorAll` calls against the premask condition, with no
   * per-element work beyond a tag read. That is strictly less than one
   * `scan()`, which queries and then calls `upsert()` on every match.
   *
   * The expensive half of a health sample is not the query, it is evaluating
   * every invariant and flushing a snapshot to `storage.local`. So the tick
   * samples only when the census is non-empty: an idle page with nothing
   * occluded queries, finds nothing, and writes nothing (Charter §8). A page
   * that does have something occluded is a page with something to say.
   *
   * The period is also the threshold the invariant measures against.
   * `setTimeout` never fires early, so an element first seen by one tick's
   * census has necessarily aged past the grace window by the next — reported
   * on the tick after the one that found it, with no margin needed.
   */
  private _armOcclusionWatch(): void {
    if (this._occlusionWatch !== null) return
    this._occlusionWatch = setTimeout(() => {
      this._occlusionWatch = null
      // Belt to reset()'s braces: either one alone stops the cadence after a
      // teardown. The guard is what makes an already-scheduled tick correct,
      // the disarm is what releases the handle promptly rather than up to
      // OCCLUSION_GRACE_MS later.
      if (this._phase !== "running") return
      this._armOcclusionWatch()

      this._occlusionReading(Date.now())
    }, OCCLUSION_GRACE_MS)
  }

  /**
   * Look at the page once, and report only if there is something to report.
   *
   * `force` is for the reading `startSession()` takes: a new session must
   * publish a verdict about the page it is actually on, even a clean one,
   * because the latest persisted verdict otherwise still describes the page
   * before the navigation.
   */
  private _occlusionReading(now: number, force = false): void {
    // Prunes and stamps `_occludedSince` as a side effect, which is why it
    // runs on every reading, including ones that report nothing.
    // `_observabilityContext()` below repeats it; at the same `now` that is
    // idempotent, and it happens only on readings already taking a sample.
    const occluded = this._occlusionCensus(now).length > 0
    const wasOccluded = this._occludedLastReading
    this._occludedLastReading = occluded

    // Clean now and clean last time: nothing to say, and saying it would cost
    // a storage write every tick for as long as the tab is open.
    //
    // The `wasOccluded` half is not an optimization detail — it is the sample
    // that reports a page *became* clean. Bot-found (round 3): skipping it
    // leaves a healed violation on the diagnostics page forever and never
    // emits `invariant.recovered`, which is this invariant's own stuck-report
    // failure with the sign flipped.
    if (!force && !occluded && !wasOccluded) return

    const obs = observability()
    // Bypasses _sampleHealth()'s throttle deliberately — round 2 above is what
    // that throttle does to this invariant when it is in the way.
    if (obs) void obs.sampleHealth(this._observabilityContext(now))
  }

  private _disarmOcclusionWatch(): void {
    if (this._occlusionWatch !== null) {
      clearTimeout(this._occlusionWatch)
      this._occlusionWatch = null
    }
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
