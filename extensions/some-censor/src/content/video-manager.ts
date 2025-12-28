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
  private nextLevel(
    current: DisclosureLevel,
    event: "HOVER" | "CLICK" | "DBLCLICK"
  ): DisclosureLevel {
    switch (event) {
      case "DBLCLICK":
        // Always reveal from any state
        return DisclosureLevel.REVEALED

      case "HOVER":
        // ✅ INVARIANT: hover only works from MASKED
        if (current === DisclosureLevel.MASKED) {
          return DisclosureLevel.METADATA
        }
        return current

      case "CLICK":
        // ✅ INVARIANT: click only advances from METADATA
        if (current === DisclosureLevel.METADATA) {
          return DisclosureLevel.TITLE
        }
        return current

      default: {
        // Exhaustiveness check (will error if a new event is added)
        event satisfies never
        return current
      }
    }
  }

  /**
   * Apply level to DOM - idempotent
   */
  private applyLevel(videoId: string): void {
    const video = this.videos.get(videoId)
    if (!video) return

    const overlay = video.element.querySelector(".boyo-overlay") as HTMLElement
    if (!overlay) {
      console.warn(`[BOYO] No overlay found for ${videoId}`)
      return
    }

    // Update data attribute for CSS styling
    overlay.dataset.level = String(video.level)

    // 2. FORCE RENDER - Critical for CSS transitions
    this.forceRender(video.element)

    // Clear existing content
    overlay.innerHTML = ""

    // Build up overlay content based on level
    if (video.level >= DisclosureLevel.METADATA) {
      const metadata = extractMetadata(video.element)
      if (metadata) {
        const metadataEl = createMetadataDisplay(metadata)
        console.log(`[BOYO] Adding metadata element:`, metadataEl.className)
        overlay.appendChild(metadataEl)
        this.forceRender(video.element)
      }
    }

    if (video.level >= DisclosureLevel.TITLE) {
      const title = extractTitle(video.element)
      console.log(
        `[BOYO] extractTitle returned:`,
        title,
        `for element:`,
        video.element
      )
      if (title) {
        const titleEl = createTitleDisplay(title, false) // FIXED: Don't obfuscate at TITLE level
        console.log(
          `[BOYO] Adding title element:`,
          titleEl.className,
          titleEl.textContent
        )
        overlay.appendChild(titleEl)
        this.forceRender(video.element)
      } else {
        console.warn(
          `[BOYO] No title found for ${videoId}, element:`,
          video.element
        )
        console.warn(
          `[BOYO] Tried selector: #video-title, found:`,
          video.element.querySelector("#video-title")
        )
      }
    }

    if (video.level === DisclosureLevel.REVEALED) {
      console.log(`[BOYO] Revealing ${videoId}`)
      video.element.classList.remove("boyo-masked")
      video.element.classList.add("boyo-revealed")
      this.forceRender(video.element)
      overlay.remove()
    }

    console.log(
      `[BOYO] Overlay content after update:`,
      overlay.innerHTML.substring(0, 100)
    )
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
   * Force browser to apply styles synchronously
   * Triggers reflow/repaint before returning
   */
  private forceRender(element: Element): void {
    if (!(element instanceof HTMLElement)) return
    // Reading offsetHeight forces a synchronous reflow
    void element.offsetHeight

    // Force the overlay specifically
    const overlay = element.querySelector(".boyo-overlay") as HTMLElement
    if (overlay) {
      void overlay.offsetHeight
    }
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
