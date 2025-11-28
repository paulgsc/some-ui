import { getAllVideoElements } from "@censor/utils/dom"
import { storage } from "@censor/utils/storage"

import { VideoManager } from "./video-manager"

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
    await storage.initialize()
    this.injectCSS()
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

  private injectCSS(): void {
    // Check if already injected
    if (document.querySelector("style#boyo-censor")) return

    const style = document.createElement("style")
    style.id = "boyo-censor"
    style.textContent = `
      /* Critical: Apply immediately */
        ytd-video-renderer:not(.boyo-revealed),
      ytd-rich-item-renderer:not(.boyo-revealed),
      ytd-grid-video-renderer:not(.boyo-revealed),
      ytd-compact-video-renderer:not(.boyo-revealed) {
        position: relative !important;
      }

      .boyo-masked {
        filter: blur(20px) grayscale(100%) !important;
        opacity: 0.3 !important;
        pointer-events: auto !important;
        transition: filter 0.1s ease, opacity 0.1s ease !important;
      }

      .boyo-revealed {
        filter: none !important;
        opacity: 1 !important;
      }

      .boyo-overlay {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        background: rgba(0, 0, 0, 0.8) !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 100 !important;
        cursor: pointer !important;
        border-radius: 12px !important;
      }

      .boyo-overlay::before {
        content: "🔒 Click to reveal" !important;
        color: #fff !important;
        font-size: 14px !important;
        font-weight: 500 !important;
        margin-bottom: 12px !important;
      }

      .boyo-metadata,
      .boyo-title {
        color: #fff !important;
        font-size: 12px !important;
        text-align: center !important;
        padding: 8px 16px !important;
        background: rgba(255, 255, 255, 0.1) !important;
        border-radius: 8px !important;
        margin: 4px !important;
      }

      .boyo-metadata-item {
        margin: 4px 0 !important;
      }

      .boyo-title {
        font-size: 14px !important;
        max-width: 80% !important;
      }

      .boyo-overlay[data-level="1"]::before {
        content: "🔍 Hover for details • Click to reveal" !important;
      }

      .boyo-overlay[data-level="2"]::before {
        content: "👆 Double-click to reveal fully" !important;
      }
      `

    // Inject into head immediately
    ;(document.head || document.documentElement).appendChild(style)

    // Verify injection
    if (!document.querySelector("style#boyo-censor")) {
      console.error("[BOYO] Protection layer failed to load")
      document.body.style.opacity = "0"
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

          if (
            node.matches(
              "ytd-video-renderer, ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer"
            )
          ) {
            this.videoManager.processVideo(node)
          } else {
            node
              .querySelectorAll(
                "ytd-video-renderer, ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer"
              )
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
