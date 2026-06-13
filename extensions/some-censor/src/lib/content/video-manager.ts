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

import { publish, registerDebugSource } from "./debug"
import { tryExtract } from "./extract/index"
import { makeProvisionalRecord, makeRecord } from "./record"
import { SEL } from "./selectors"
import type { SessionId } from "./session"
import { mkSession } from "./session"
import { VideoEntry } from "./video-entry"

type Phase = "idle" | "running"

export class VideoManager {
  // Primary lookup: videoId → entry
  private readonly _byVideo: Map<VideoId, VideoEntry> = new Map()
  // Element → videoId: detects scroll-virtualizer element reuse
  private readonly _elToVid: WeakMap<HTMLElement, VideoId> = new WeakMap()
  // Failed-resolution queue
  private readonly _unresolved: Map<string, HTMLElement> = new Map()
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

    const extracted = tryExtract(el)

    if (extracted.kind === "full" || extracted.kind === "video-only") {
      this._unresolved.delete(elementKey(el))

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
          this._channelPending.delete(rawAsPrevId)
        }
      }

      if (extracted.kind === "full") {
        // Full resolution: if a provisional entry exists, backfill it rather
        // than tearing it down (avoids a mask flicker on the fast path).
        const pending = this._byVideo.get(currentId)
        if (pending && !pending.hasChannel) {
          this._channelPending.delete(currentId)
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
      const key = elementKey(el)
      const wasEmpty = this._unresolved.size === 0
      this._unresolved.set(key, el)
      if (wasEmpty) this._ensureRetryLoop()
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
    for (const [key, el] of this._unresolved) {
      if (!el.isConnected) {
        this._unresolved.delete(key)
        continue
      }
      const extracted = tryExtract(el)
      if (extracted.kind === "full") {
        this._unresolved.delete(key)
        void this._promote(el, extracted.videoId, extracted.channelId)
      } else if (extracted.kind === "video-only") {
        // Maskable now — mount provisionally; channel resolves on a later pass.
        this._unresolved.delete(key)
        this._promoteProvisional(el, extracted.videoId)
      }
    }

    // Backfill channel for already-masked provisional entries.
    for (const [videoId, el] of this._channelPending) {
      if (!el.isConnected) {
        this._channelPending.delete(videoId)
        continue
      }
      const extracted = tryExtract(el)
      if (extracted.kind === "full") {
        this._channelPending.delete(videoId)
        const entry = this._byVideo.get(videoId)
        if (entry) void this._backfill(entry, extracted.channelId)
      }
    }
    this._maybeStopRetryLoop()
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
        this._channelPending.delete(videoId)
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
      if (!existing.hasChannel) this._channelPending.set(videoId, el)
      return
    }
    existing?.destroy()

    const prevVid = this._elToVid.get(el)
    if (prevVid !== undefined && prevVid !== videoId) {
      this._byVideo.get(prevVid)?.destroy()
      this._byVideo.delete(prevVid)
      this._channelPending.delete(prevVid)
    }

    const record = makeProvisionalRecord(
      { kind: "video-only", videoId, channelId: null },
      this._session
    )
    this._elToVid.set(el, videoId)
    const entry = new VideoEntry(record, el, /* isWhitelisted */ false)
    this._byVideo.set(videoId, entry)
    this._channelPending.set(videoId, el)
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
