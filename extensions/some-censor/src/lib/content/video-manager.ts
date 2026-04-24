import type { ChannelId, VideoId } from "@censor/types/ids"
import type { Resolved } from "@censor/types/states"

import { tryResolve } from "./resolver"
import { VideoRecord } from "./video-record"

/**
 * VideoManager — per-session registry of all tracked video elements.
 *
 * Identity model:
 *   _byVideo  : Map<VideoId, VideoRecord>
 *               Primary lookup for event dispatch.
 *
 *   _elToVid  : WeakMap<HTMLElement, VideoId>
 *               Detects scroll-virtualizer element reuse.
 *               Same HTMLElement + different videoId → hard reset before promoting.
 *
 * Unresolved registry:
 *   _unresolved : Map<string, HTMLElement>
 *               Failed-resolution elements, kept indefinitely.
 *               Retried on every relevant mutation via retryUnresolved().
 *               No finite retry cap — convergence is event-driven.
 */
export class VideoManager {
  private readonly _byVideo: Map<VideoId, VideoRecord> = new Map()
  private readonly _elToVid: WeakMap<HTMLElement, VideoId> = new WeakMap()
  private readonly _unresolved: Map<string, HTMLElement> = new Map()
  private readonly _promoting: WeakSet<HTMLElement> = new WeakSet()
  private _retryInterval: number | null = null

  private _ensureRetryLoop(): void {
    try {
      if (this._retryInterval !== null) return

      this._retryInterval = window.setInterval(() => {
        try {
          this.retryUnresolved()
        } catch (err) {
          console.error("[VideoManager] retryUnresolved threw", {
            err,
            unresolvedSize: this._unresolved.size,
          })
        }
      }, 500)
    } catch (err) {
      console.error("[VideoManager] _ensureRetryLoop failed to start", err)
    }
  }

  private _maybeStopRetryLoop(): void {
    if (this._unresolved.size === 0 && this._retryInterval !== null) {
      clearInterval(this._retryInterval)
      this._retryInterval = null
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  upsert(el: HTMLElement): void {
    const result = tryResolve(el)
    if (result.kind === "resolved") {
      this._unresolved.delete(elementKey(el))
      void this._promote(result)
      this._maybeStopRetryLoop()
    } else {
      const key = elementKey(el)
      const wasEmpty = this._unresolved.size === 0

      this._unresolved.set(key, el)

      if (wasEmpty) {
        this._ensureRetryLoop()
      }
    }
  }

  /**
   * Retry all unresolved elements. Called on every relevant DOM mutation.
   * Elements that left the DOM are evicted from the registry.
   */
  retryUnresolved(): void {
    for (const [key, el] of this._unresolved) {
      try {
        if (!document.contains(el)) {
          this._unresolved.delete(key)
          continue
        }

        const result = tryResolve(el)
        if (result.kind === "resolved") {
          this._unresolved.delete(key)
          void this._promote(result)
        }
      } catch (err) {
        console.error("[VideoManager] retryUnresolved item failed", {
          key,
          el,
          err,
        })
        // optionally evict to avoid infinite poison loop
        this._unresolved.delete(key)
      }
    }

    this._maybeStopRetryLoop()
  }

  handleClick(videoId: VideoId): void {
    this._byVideo.get(videoId)?.gate.rawClick()
  }
  handleDblClick(videoId: VideoId): void {
    this._byVideo.get(videoId)?.gate.rawDblClick()
  }

  async whitelistChannel(videoId: VideoId): Promise<void> {
    const record = this._byVideo.get(videoId)
    if (!record) return

    const channelName =
      record.el
        .querySelector(
          "ytd-channel-name yt-formatted-string, #channel-name yt-formatted-string"
        )
        ?.textContent?.trim() ?? String(record.channelId)

    try {
      await browser.runtime.sendMessage({
        type: "ADD_WHITELIST",
        channelId: String(record.channelId),
        channelName,
      })
    } catch (err) {
      console.error("[BOYO] whitelistChannel: sendMessage failed", err)
    }

    this._whitelistChannelLocally(record.channelId)
  }

  /**
   * Called when background broadcasts CHANNEL_WHITELISTED
   * (e.g. whitelisted from another tab or a future popup UI).
   */
  applyWhitelistBroadcast(channelId: string): void {
    this._whitelistChannelLocally(channelId as ChannelId)
  }

  reset(): void {
    for (const r of this._byVideo.values()) r.destroy()
    this._byVideo.clear()
    this._unresolved.clear()

    if (this._retryInterval !== null) {
      clearInterval(this._retryInterval)
      this._retryInterval = null
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async _promote(result: Resolved): Promise<void> {
    const { el, videoId, channelId } = result

    // Guard concurrent promotions for the same element (async whitelist check)
    if (this._promoting.has(el)) return
    this._promoting.add(el)

    try {
      // Scroll-virtualizer reuse: same HTMLElement, different videoId → destroy old
      const prevVid = this._elToVid.get(el)
      if (prevVid !== undefined && prevVid !== videoId) {
        this._byVideo.get(prevVid)?.destroy()
        this._byVideo.delete(prevVid)
      }

      // Same element, same videoId → veil repair only (no remount)
      const existing = this._byVideo.get(videoId)
      if (existing?.el === el) {
        existing.repair()
        return
      }

      // Different element for same videoId (element recycled) → replace
      existing?.destroy()

      // Async: whitelist check via background message
      const isWhitelisted: boolean = await browser.runtime
        .sendMessage({ type: "IS_WHITELISTED", channelId: String(channelId) })
        .then((r: { ok: boolean; whitelisted: boolean }) => r.whitelisted)
        .catch(() => false)

      this._elToVid.set(el, videoId)
      const record = new VideoRecord(result, isWhitelisted)
      this._byVideo.set(videoId, record)
      record.mount()
    } finally {
      this._promoting.delete(el)
    }
  }

  private _whitelistChannelLocally(channelId: ChannelId | string): void {
    for (const r of this._byVideo.values()) {
      if (r.channelId === channelId) {
        r.dispatchWhitelist()
      }
    }
  }
}

/**
 * Stable Map key for the unresolved registry.
 * Priority: data-video-id attr > first watch/shorts href > DOM position > random fallback.
 */
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
