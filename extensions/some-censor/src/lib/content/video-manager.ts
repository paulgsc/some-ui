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
 *   M1 — Phase gate.  upsert() and dispatch() throw if called while idle.
 *        This makes double-setup detectable as a deterministic error rather
 *        than silent duplicate state.
 *
 *   M2 — Upsert idempotence.  For a given (el, videoId) pair:
 *        calling upsert(el) N times produces the same entry as calling it once.
 *        Achieved by the existing-entry repair path.
 *
 *   M3 — reset() is total.  Every DomHandle is destroyed.  Every map is cleared.
 *        After reset(), size() === 0 and no boyo artifacts remain in the DOM.
 *
 *   M4 — No ghost entries.  retryUnresolved() evicts elements that left the DOM
 *        (!el.isConnected).
 *
 *   M5 — Session monotonicity.  Each call to startSession() supplies a fresh
 *        SessionId from mkSession().  Entries from a previous session carry a
 *        different SessionId and are destroyed during reset() before the new
 *        session starts.
 */

import type { ChannelId, VideoId } from "@censor/types/ids"

import { tryExtract } from "./extract/index"
import { makeRecord } from "./record"
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
  // Concurrent-promotion guard
  private readonly _promoting: WeakSet<HTMLElement> = new WeakSet()

  private _phase: Phase = "idle"
  private _session: SessionId = mkSession()
  private _retryInterval: ReturnType<typeof setInterval> | null = null

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
    return this._session
  }

  /**
   * Total reset — destroy all entries, clear all maps, return to idle.
   * Returns the new SessionId that the next startSession() will use, so
   * callers can confirm the boundary if needed.
   */
  reset(): void {
    for (const entry of this._byVideo.values()) entry.destroy()
    this._byVideo.clear()
    this._unresolved.clear()

    if (this._retryInterval !== null) {
      clearInterval(this._retryInterval)
      this._retryInterval = null
    }

    this._phase = "idle"
  }

  get size(): number {
    return this._byVideo.size
  }

  get unresolvedSize(): number {
    return this._unresolved.size
  }

  // ── Public API ────────────────────────────────────────────────────────────

  upsert(el: HTMLElement): void {
    this._assertRunning("upsert")

    const extracted = tryExtract(el)

    if (extracted.kind === "full") {
      this._unresolved.delete(elementKey(el))

      // 1. Check for Recycling: Is this element already managed by an Entry?
      // In VideoEntry constructor, we set el.dataset["boyoVid"] = record.videoId
      const rawPreviousId = el.dataset["boyoVid"]
      const currentId = extracted.videoId as VideoId // Already "blessed" by tryExtract

      if (rawPreviousId && rawPreviousId !== currentId) {
        this.softReset()
        // Note: We cast rawPreviousId to VideoId here just to look it up in our map
        // The element is being reused for a different video.
        // We MUST kill the old entry to satisfy Invariant Entry-1 & D3.
        const oldEntry = this._byVideo.get(rawPreviousId as VideoId)
        if (oldEntry) {
          oldEntry.destroy()
          this._byVideo.delete(rawPreviousId as VideoId)
        }
      }

      // 2. Promote the new identity
      void this._promote(el, currentId, extracted.channelId as ChannelId)

      this._maybeStopRetryLoop()
    } else {
      const key = elementKey(el)
      const wasEmpty = this._unresolved.size === 0
      this._unresolved.set(key, el)
      if (wasEmpty) this._ensureRetryLoop()
    }
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
        void this._promote(
          el,
          extracted.videoId as VideoId,
          extracted.channelId as ChannelId
        )
      }
    }
    this._maybeStopRetryLoop()
  }

  softReset(): void {
    // DO NOT teardown everything
    this._session = mkSession()
  }

  reconcileSession(): void {
    for (const entry of this._byVideo.values()) {
      if (!entry.isConnected) {
        this._session = mkSession()
        return
      }
    }
  }

  prune(): void {
    for (const [videoId, entry] of this._byVideo) {
      const isDisconnected = !entry.isConnected
      const isStale = entry.record.session !== this._session

      if (isDisconnected || isStale) {
        entry.destroy()
        this._byVideo.delete(videoId)
      }
    }
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
      await browser.runtime.sendMessage({
        type: "ADD_WHITELIST",
        channelId: entry.record.channelId,
        channelName,
      })
    } catch (err) {
      console.error("[BOYO] whitelistChannel: sendMessage failed", err)
    }

    this._whitelistChannelLocally(entry.record.channelId)
  }

  applyWhitelistBroadcast(channelId: string): void {
    this._whitelistChannelLocally(channelId)
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
      // Scroll-virtualizer reuse: same el, different videoId → destroy old entry
      const prevVid = this._elToVid.get(el)
      const session = this._session
      if (prevVid !== undefined && prevVid !== videoId) {
        this._byVideo.get(prevVid)?.destroy()
        this._byVideo.delete(prevVid)
      }

      // Same el, same videoId → repair veil only
      const existing = this._byVideo.get(videoId)
      if (existing?.record.session === this._session) {
        existing.repair()
        return
      }

      // Replace stale entry (different session) or brand-new entry
      existing?.destroy()

      const isWhitelisted = await browser.runtime
        .sendMessage({ type: "IS_WHITELISTED", channelId: String(channelId) })
        .then((r: { ok: boolean; whitelisted: boolean }) => r.whitelisted)
        .catch(() => false)

      // Guard: session may have changed while awaiting
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
    } finally {
      this._promoting.delete(el)
    }
  }

  private _whitelistChannelLocally(channelId: string): void {
    for (const entry of this._byVideo.values()) {
      if (entry.record.channelId === channelId) {
        entry.dispatchWhitelist()
      }
    }
  }

  private _ensureRetryLoop(): void {
    if (this._retryInterval !== null) return
    this._retryInterval = setInterval(() => {
      try {
        this.retryUnresolved()
      } catch (err) {
        console.error("[VideoManager] retry threw", err)
      }
    }, 500)
  }

  private _maybeStopRetryLoop(): void {
    if (this._unresolved.size === 0 && this._retryInterval !== null) {
      clearInterval(this._retryInterval)
      this._retryInterval = null
    }
  }

  private _assertRunning(op: string): void {
    if (this._phase !== "running") {
      throw new Error(
        `[BOYO] Invariant violated: ${op}() called while manager is "${this._phase}". ` +
          `Call startSession() first.`
      )
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
