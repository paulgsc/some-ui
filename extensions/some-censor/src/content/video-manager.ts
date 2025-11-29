import type { VideoElement } from "@censor/types"
import { DisclosureLevel } from "@censor/types"
import {
  createMetadataDisplay,
  createOverlay,
  createTitleDisplay,
  extractChannelId,
  extractMetadata,
  extractTitle,
  extractVideoId,
} from "@censor/utils/dom"
import { storageAPI } from "@censor/utils/storage-api"

export class VideoManager {
  private videos = new Map<string, VideoElement>()

  /**
   * Idempotent video processing - safe to call multiple times
   * Handles element reuse in SPA by tracking both videoId AND element
   */
  async upsert(element: Element): Promise<void> {
    if (!(element instanceof HTMLElement)) return

    const videoId = extractVideoId(element)
    const channelId = extractChannelId(element)

    if (!videoId || !channelId) {
      return
    }

    // Check if this exact element was already processed for this videoId
    const existing = this.videos.get(videoId)
    if (existing && existing.element === element) {
      return
    }

    // Element reuse detected - clean up old tracking
    if (existing && existing.element !== element) {
      console.log(`[BOYO] Element reuse detected for ${videoId}`)
      this.cleanup(videoId)
    }

    console.log(`[BOYO] Upserting video ${videoId} from channel ${channelId}`)

    const isWhitelisted = await storageAPI.isWhitelisted(channelId)
    const initialLevel = isWhitelisted
      ? DisclosureLevel.REVEALED
      : DisclosureLevel.MASKED

    this.videos.set(videoId, {
      element,
      videoId,
      channelId,
      level: initialLevel,
    })

    // Ensure overlay exists
    this.ensureOverlay(element, videoId)

    // Apply initial state
    this.applyLevel(videoId)
  }

  /**
   * FSM transition - single source of truth
   */
  transition(videoId: string, event: "HOVER" | "CLICK" | "DBLCLICK"): void {
    const video = this.videos.get(videoId)
    if (!video) {
      return
    }

    const currentLevel = video.level
    const nextLevel = this.nextLevel(currentLevel, event)

    if (nextLevel === currentLevel) {
      return
    }

    console.log(
      `[BOYO] ${videoId}: ${DisclosureLevel[currentLevel]} --${event}--> ${DisclosureLevel[nextLevel]}`
    )

    video.level = nextLevel
    this.applyLevel(videoId)
  }

  /**
   * FSM transition table - authoritative
   */
  private nextLevel(current: DisclosureLevel, event: string): DisclosureLevel {
    // Double-click always reveals from any state
    if (event === "DBLCLICK") {
      return DisclosureLevel.REVEALED
    }

    // Click advances from METADATA to TITLE
    if (event === "CLICK" && current === DisclosureLevel.METADATA) {
      return DisclosureLevel.TITLE
    }

    // Hover advances from MASKED to METADATA
    if (event === "HOVER" && current === DisclosureLevel.MASKED) {
      return DisclosureLevel.METADATA
    }

    // No valid transition
    return current
  }

  /**
   * Apply level to DOM - idempotent
   */
  private applyLevel(videoId: string): void {
    const video = this.videos.get(videoId)
    if (!video) return

    const overlay = video.element.querySelector(".boyo-overlay") as HTMLElement
    if (!overlay) {
      return
    }

    // Update data attribute for CSS styling
    overlay.dataset.level = String(video.level)

    // Clear existing content
    overlay.innerHTML = ""

    // Build up overlay content based on level
    if (video.level >= DisclosureLevel.METADATA) {
      const metadata = extractMetadata(video.element)
      if (metadata) {
        overlay.appendChild(createMetadataDisplay(metadata))
      }
    }

    if (video.level >= DisclosureLevel.TITLE) {
      const title = extractTitle(video.element)
      if (title) {
        overlay.appendChild(createTitleDisplay(title, false))
      }
    }

    if (video.level === DisclosureLevel.REVEALED) {
      video.element.classList.remove("boyo-masked")
      video.element.classList.add("boyo-revealed")
      overlay.remove()
    }
  }

  /**
   * Ensure overlay exists - idempotent
   */
  private ensureOverlay(element: HTMLElement, videoId: string): void {
    // Remove any stale overlays first
    const existingOverlay = element.querySelector(".boyo-overlay")
    if (existingOverlay) {
      existingOverlay.remove()
    }

    element.classList.add("boyo-masked")
    const overlay = createOverlay(videoId)
    element.appendChild(overlay)
  }

  /**
   * Clean up tracking for a video
   */
  private cleanup(videoId: string): void {
    const video = this.videos.get(videoId)
    if (video) {
      const overlay = video.element.querySelector(".boyo-overlay")
      if (overlay) {
        overlay.remove()
      }
      video.element.classList.remove("boyo-masked", "boyo-revealed")
    }
    this.videos.delete(videoId)
  }

  /**
   * Reset all tracked videos - for navigation events
   */
  reset(): void {
    console.log(`[BOYO] Resetting ${this.videos.size} tracked videos`)

    // Clean up all overlays
    for (const [videoId] of this.videos) {
      this.cleanup(videoId)
    }

    this.videos.clear()
  }

  /**
   * Add channel to whitelist and reveal all its videos
   */
  async addChannelToWhitelist(videoId: string): Promise<void> {
    const video = this.videos.get(videoId)
    if (!video) return

    const metadata = extractMetadata(video.element)
    if (!metadata) return

    await storageAPI.addToWhitelist({
      channelId: video.channelId,
      channelName: metadata.channelName,
      addedAt: Date.now(),
    })

    console.log(`[BOYO] Channel ${video.channelId} whitelisted`)

    // Reveal all videos from this channel
    for (const [vid, v] of this.videos.entries()) {
      if (v.channelId === video.channelId) {
        v.level = DisclosureLevel.REVEALED
        this.applyLevel(vid)
      }
    }
  }

  getVideo(videoId: string): VideoElement | undefined {
    return this.videos.get(videoId)
  }

  getVideoCount(): number {
    return this.videos.size
  }
}
