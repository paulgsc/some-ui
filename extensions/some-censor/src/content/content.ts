import { getAllVideoElements, VIDEO_SELECTOR_STRING } from "@censor/utils/dom"
import { storageAPI } from "@censor/utils/storage-api"

import { VideoManager } from "./video-manager"

import "@censor/styles/content.css"

class ContentController {
  private videoManager: VideoManager
  private initialized = false
  private clickTimeout: number | null = null
  private lastClickTarget: string | null = null

  constructor() {
    this.videoManager = new VideoManager()
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    console.log("[BOYO] Initializing content script")
    await storageAPI.initialize()
    // CSS is now loaded via manifest.json — no need to inject manually
    this.waitForYouTube()
    this.initialized = true
  }

  private waitForYouTube(): void {
    if (document.querySelector("ytd-app")) {
      console.log("[BOYO] YouTube app found, setting up")
      this.setup()
    } else {
      console.log("[BOYO] Waiting for YouTube app...")
      const observer = new MutationObserver(() => {
        if (document.querySelector("ytd-app")) {
          console.log("[BOYO] YouTube app loaded")
          observer.disconnect()
          this.setup()
        }
      })
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      })
    }
  }

  private setup(): void {
    console.log("[BOYO] Setting up event delegation")
    setTimeout(() => {
      this.processInitialVideos()
      this.setupEventDelegation()
      this.observeNewContent()
    }, 1000)
  }

  private async processInitialVideos(): Promise<void> {
    const videos = getAllVideoElements()
    console.log(`[BOYO] Processing ${videos.length} initial videos`)

    for (const video of videos) {
      await this.videoManager.processVideo(video)
    }

    console.log(
      `[BOYO] Finished processing. Videos in manager: ${this.videoManager.getVideoCount()}`
    )
  }

  private setupEventDelegation(): void {
    document.addEventListener(
      "mouseenter",
      this.handleMouseEnter.bind(this),
      true
    )
    document.addEventListener("click", this.handleClick.bind(this), true)
    document.addEventListener(
      "dblclick",
      this.handleDoubleClick.bind(this),
      true
    )
    document.addEventListener(
      "contextmenu",
      this.handleContextMenu.bind(this),
      true
    )
  }

  private handleMouseEnter(e: MouseEvent): void {
    const overlay = (e.target as HTMLElement).closest(
      ".boyo-overlay"
    ) as HTMLElement
    if (!overlay) return
    const videoId = overlay.dataset.videoId
    if (videoId) this.videoManager.handleHover(videoId)
  }

  private handleClick(e: MouseEvent): void {
    const overlay = (e.target as HTMLElement).closest(
      ".boyo-overlay"
    ) as HTMLElement
    if (!overlay) return
    e.preventDefault()
    e.stopPropagation()

    const videoId = overlay.dataset.videoId
    if (!videoId) return

    if (this.lastClickTarget === videoId && this.clickTimeout) {
      clearTimeout(this.clickTimeout)
      this.clickTimeout = null
      this.lastClickTarget = null
      return
    }

    this.lastClickTarget = videoId
    this.clickTimeout = window.setTimeout(() => {
      this.videoManager.handleClick(videoId)
      this.clickTimeout = null
      this.lastClickTarget = null
    }, 250)
  }

  private handleDoubleClick(e: MouseEvent): void {
    const overlay = (e.target as HTMLElement).closest(
      ".boyo-overlay"
    ) as HTMLElement
    if (!overlay) return
    e.preventDefault()
    e.stopPropagation()
    const videoId = overlay.dataset.videoId
    if (videoId) this.videoManager.handleDoubleClick(videoId)
  }

  private handleContextMenu(e: MouseEvent): void {
    const overlay = (e.target as HTMLElement).closest(
      ".boyo-overlay"
    ) as HTMLElement
    if (!overlay) return
    e.preventDefault()
    const videoId = overlay.dataset.videoId
    if (videoId) this.showContextMenu(e, videoId)
  }

  private showContextMenu(_e: MouseEvent, videoId: string): void {
    const video = this.videoManager.getVideo(videoId)
    if (!video) return
    const result = confirm(
      "Add this channel to whitelist? (Always show content from this channel)"
    )
    if (result) this.videoManager.addChannelToWhitelist(videoId)
  }

  private observeNewContent(): void {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue

          if (node.matches(VIDEO_SELECTOR_STRING)) {
            this.videoManager.processVideo(node)
          } else {
            node
              .querySelectorAll(VIDEO_SELECTOR_STRING)
              .forEach((video) => this.videoManager.processVideo(video))
          }
        }
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })
  }
}

const controller = new ContentController()
controller.initialize()
