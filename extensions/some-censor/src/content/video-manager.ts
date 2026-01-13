// video-manager.ts
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

import { SyncClickGate } from "./click-gating"
import {
  createInitialState,
  deriveDisplayLevel,
  transition,
  type DisclosureLevel,
  type FSMState,
} from "./fsm-core"
import { initManager } from "./initialization-manager"

type VideoState = {
  element: Element
  videoId: string
  channelId: string
  fsm: FSMState
  hovered: boolean
  clickGate: SyncClickGate
}

export class VideoManager {
  private videos = new Map<string, VideoState>()
  private pendingRetries = new Set<string>() // Store element identifier, not reference

  /**
   * CRITICAL FIX: Retry logic for YouTube's lazy DOM rendering
   */
  async upsert(element: Element, retryCount = 0): Promise<void> {
    if (!(element instanceof HTMLElement)) return

    // Create stable identifier for retry tracking
    const elementId = this.getElementIdentifier(element)

    const videoId = extractVideoId(element)
    const channelId = extractChannelId(element)

    // CRITICAL: YouTube renders DOM progressively - retry if missing data
    if (!videoId || !channelId) {
      if (retryCount < 3 && !this.pendingRetries.has(elementId)) {
        console.log(
          `[BOYO] Retry ${retryCount + 1} for element (missing ${!videoId ? "videoId" : "channelId"})`
        )
        this.pendingRetries.add(elementId)
        setTimeout(() => {
          this.pendingRetries.delete(elementId)
          this.upsert(element, retryCount + 1)
        }, 200)
      } else if (retryCount >= 3) {
        console.warn(`[BOYO] Failed to extract data after 3 retries`, {
          hasVideoId: !!videoId,
          hasChannelId: !!channelId,
          elementId,
        })
      }
      return
    }

    const existing = this.videos.get(videoId)

    // Check if this is the exact same element we already processed
    if (existing && existing.element === element) {
      // Verify overlay still exists
      const overlay = element.querySelector(".boyo-overlay")
      if (overlay) {
        return // Already processed correctly
      }
    }

    // Element changed for this videoId
    if (existing && existing.element !== element) {
      console.log(`[BOYO] Element changed for ${videoId}`)
      this.cleanup(videoId)
    }

    console.log(`[BOYO] Processing video ${videoId} from channel ${channelId}`)

    const isWhitelisted = await storageAPI.isWhitelisted(channelId)

    this.videos.set(videoId, {
      element,
      videoId,
      channelId,
      fsm: createInitialState(isWhitelisted),
      hovered: false,
      clickGate: new SyncClickGate(),
    })

    this.ensureOverlay(element, videoId)
    this.render(videoId)
  }

  // Event handlers - pure delegations to FSM
  handleHoverStart(videoId: string): void {
    const video = this.videos.get(videoId)
    if (!video) {
      console.warn(`[BOYO] handleHoverStart: video ${videoId} not in map`)
      return
    }

    video.hovered = true
    this.render(videoId)
  }

  handleHoverEnd(videoId: string): void {
    const video = this.videos.get(videoId)
    if (!video) return

    video.hovered = false
    this.render(videoId)
  }

  handleClick(videoId: string): void {
    const video = this.videos.get(videoId)
    if (!video) {
      console.error(
        `[BOYO] handleClick: video ${videoId} not in map - this should never happen`
      )
      return
    }

    console.log(`[BOYO] Click on ${videoId}, current level: ${video.fsm.level}`)
    const ts = Date.now()
    video.fsm = video.clickGate.handleRawClick(video.fsm, ts)
    console.log(`[BOYO] After click, new level: ${video.fsm.level}`)
    this.render(videoId)
  }

  handleDblClick(videoId: string): void {
    const video = this.videos.get(videoId)
    if (!video) {
      console.error(`[BOYO] handleDblClick: video ${videoId} not in map`)
      return
    }

    console.log(`[BOYO] Double-click on ${videoId}`)
    const ts = Date.now()
    video.fsm = video.clickGate.handleRawDblclick(video.fsm, ts)
    this.render(videoId)
  }

  // Render - derives display state, applies to DOM
  private render(videoId: string): void {
    const video = this.videos.get(videoId)
    if (!video) return

    const displayLevel = deriveDisplayLevel(video.fsm.level, video.hovered)
    this.applyLevel(video, displayLevel)
  }

  private applyLevel(video: VideoState, displayLevel: DisclosureLevel): void {
    const overlay = video.element.querySelector(".boyo-overlay") as HTMLElement
    if (!overlay) {
      console.error(`[BOYO] CRITICAL: No overlay for ${video.videoId}`)
      // Recreate it
      this.ensureOverlay(video.element as HTMLElement, video.videoId)
      // Try again
      const newOverlay = video.element.querySelector(
        ".boyo-overlay"
      ) as HTMLElement
      if (!newOverlay) {
        console.error(
          `[BOYO] CRITICAL: Failed to recreate overlay for ${video.videoId}`
        )
        return
      }
      return this.applyLevel(video, displayLevel)
    }

    // Update level attribute for CSS
    overlay.dataset.level = String(displayLevel)
    overlay.innerHTML = ""

    // Level 1+: Show metadata
    if (displayLevel >= 1) {
      const metadata = extractMetadata(video.element)
      if (metadata) {
        const metadataEl = createMetadataDisplay(metadata)
        overlay.appendChild(metadataEl)
      }
    }

    // Level 2+: Show title
    if (displayLevel >= 2) {
      const title = extractTitle(video.element)
      if (title) {
        const titleEl = createTitleDisplay(title, false)
        overlay.appendChild(titleEl)
      }
    }

    // Level 3: Revealed
    if (displayLevel === 3) {
      console.log(`[BOYO] Revealing ${video.videoId}`)
      video.element.classList.remove("boyo-masked")
      video.element.classList.add("boyo-revealed")
      overlay.remove()
    }
  }

  private ensureOverlay(element: HTMLElement, videoId: string): void {
    // Remove any existing overlay first
    const existing = element.querySelector(".boyo-overlay")
    if (existing) {
      existing.remove()
    }

    // Add mask class
    element.classList.remove("boyo-revealed")
    element.classList.add("boyo-masked")

    // Create and tag new overlay
    const overlay = createOverlay(videoId)
    overlay.dataset.boyoSession = initManager.getSessionMarker()

    element.appendChild(overlay)
  }

  private cleanup(videoId: string): void {
    const video = this.videos.get(videoId)
    if (video) {
      video.clickGate.cleanup()
      const overlay = video.element.querySelector(".boyo-overlay")
      if (overlay) overlay.remove()
      video.element.classList.remove("boyo-masked", "boyo-revealed")
    }
    this.videos.delete(videoId)
  }

  reset(): void {
    console.log(`[BOYO] Resetting ${this.videos.size} tracked videos`)
    for (const [videoId] of this.videos) {
      this.cleanup(videoId)
    }
    this.videos.clear()
    this.pendingRetries.clear()
  }

  /**
   * Create stable identifier for element (for retry tracking)
   * Uses data attributes or position in DOM as fallback
   */
  private getElementIdentifier(element: Element): string {
    // Try data-video-id first
    const dataId = element.getAttribute("data-video-id")
    if (dataId) return `video-${dataId}`

    // Try href from first anchor
    const anchor = element.querySelector(
      'a[href*="/watch"], a[href*="/shorts/"]'
    )
    if (anchor instanceof HTMLAnchorElement && anchor.href) {
      return `href-${anchor.href}`
    }

    // Fallback: position in parent (fragile but better than nothing)
    const parent = element.parentElement
    if (parent) {
      const index = Array.from(parent.children).indexOf(element)
      return `pos-${parent.tagName}-${index}`
    }

    return `element-${Math.random()}`
  }

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
        v.fsm = transition(v.fsm, { type: "DBLCLICK", ts: Date.now() })
        this.render(vid)
      }
    }
  }

  getVideo(videoId: string): VideoState | undefined {
    return this.videos.get(videoId)
  }
}
