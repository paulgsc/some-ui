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

  async processVideo(element: Element): Promise<void> {
    console.log("[BOYO] processVideo called for element:", element)

    const videoId = extractVideoId(element)
    if (!videoId) {
      console.warn("[BOYO] Could not extract videoId from element:", element)
      return
    }

    if (this.videos.has(videoId)) {
      console.log(`[BOYO] Video ${videoId} already processed, skipping`)
      return
    }

    const channelId = extractChannelId(element)
    if (!channelId) {
      console.warn(`[BOYO] Could not extract channelId for video ${videoId}`)
      return
    }

    console.log(`[BOYO] Processing video ${videoId} from channel ${channelId}`)

    const isWhitelisted = await storageAPI.isWhitelisted(channelId)

    const videoEl: VideoElement = {
      element,
      videoId,
      channelId,
      level: isWhitelisted ? DisclosureLevel.REVEALED : DisclosureLevel.MASKED,
    }

    this.videos.set(videoId, videoEl)

    if (isWhitelisted) {
      console.log(`[BOYO] Channel ${channelId} is whitelisted, revealing`)
      this.reveal(videoId)
    } else {
      console.log(`[BOYO] Applying mask to video ${videoId}`)
      this.applyMask(element, videoId)
    }
  }

  private applyMask(element: Element, videoId: string): void {
    console.log(`[BOYO] applyMask called for ${videoId}`)
    if (!(element instanceof HTMLElement)) return

    element.classList.add("boyo-masked")

    const overlay = createOverlay(videoId)
    element.appendChild(overlay)

    console.log(`[BOYO] Mask applied to ${videoId}`)
  }

  async handleHover(videoId: string): Promise<void> {
    const video = this.videos.get(videoId)
    if (!video || video.level >= DisclosureLevel.METADATA) return

    console.log(`[BOYO] handleHover for ${videoId}`)
    const metadata = extractMetadata(video.element)
    if (!metadata) return

    video.level = DisclosureLevel.METADATA

    const overlay = video.element.querySelector(".boyo-overlay")
    if (overlay && overlay instanceof HTMLElement) {
      const metadataDisplay = createMetadataDisplay(metadata)
      overlay.appendChild(metadataDisplay)
      overlay.dataset.level = "1"
      console.log(`[BOYO] Metadata displayed for ${videoId}`)
    }
  }

  async handleClick(videoId: string): Promise<void> {
    const video = this.videos.get(videoId)
    if (!video || video.level >= DisclosureLevel.TITLE) return

    console.log(`[BOYO] handleClick for ${videoId}`)
    const title = extractTitle(video.element)
    if (!title) return

    video.level = DisclosureLevel.TITLE

    const overlay = video.element.querySelector(".boyo-overlay")
    if (overlay && overlay instanceof HTMLElement) {
      const titleDisplay = createTitleDisplay(title, true)
      overlay.appendChild(titleDisplay)
      overlay.dataset.level = "2"
      console.log(`[BOYO] Title displayed for ${videoId}`)
    }
  }

  async handleDoubleClick(videoId: string): Promise<void> {
    const video = this.videos.get(videoId)
    if (!video) return

    console.log(`[BOYO] handleDoubleClick for ${videoId}`)
    this.reveal(videoId)

    await storageAPI.updateVideoState(videoId, {
      videoId,
      revealed: true,
      timestamp: Date.now(),
    })
    console.log(`[BOYO] Video ${videoId} revealed and stored`)
  }

  private reveal(videoId: string): void {
    const video = this.videos.get(videoId)
    if (!video) return

    console.log(`[BOYO] reveal called for ${videoId}`)
    video.level = DisclosureLevel.REVEALED

    if (video.element instanceof HTMLElement) {
      video.element.classList.remove("boyo-masked")
      video.element.classList.add("boyo-revealed")

      const overlay = video.element.querySelector(".boyo-overlay")
      if (overlay) overlay.remove()
    }
  }

  getVideo(videoId: string): VideoElement | undefined {
    return this.videos.get(videoId)
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

    console.log(`[BOYO] Channel ${video.channelId} added to whitelist`)
    this.reveal(videoId)
  }

  getVideoCount(): number {
    return this.videos.size
  }
}
