import { getAllVideoElements, VIDEO_SELECTOR_STRING } from "@censor/utils/dom"
import { storageAPI } from "@censor/utils/storage-api"

import { VideoManager } from "./video-manager"

import "@censor/styles/content.css"

class ContentController {
  private videoManager: VideoManager
  private lastUrl: string = location.href

  constructor() {
    this.videoManager = new VideoManager()
  }

  async initialize(): Promise<void> {
    console.log("[BOYO] Initializing content script")
    await storageAPI.initialize()

    this.waitForYouTube()
  }

  private waitForYouTube(): void {
    if (document.querySelector("ytd-app")) {
      console.log("[BOYO] YouTube app found")
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
    console.log("[BOYO] Setting up BOYO")

    // Initial scan
    this.scan()

    // Event delegation
    this.listen()

    // Continuous observation
    this.observe()

    // SPA navigation handling - CRITICAL for YouTube
    this.handleSPANavigation()
  }

  /**
   * Scan and process all visible videos
   * Idempotent - safe to call repeatedly
   * Debounced to avoid excessive processing
   */
  private scan(): void {
    const videos = getAllVideoElements()
    console.log(`[BOYO] Scanning ${videos.length} videos`)

    // Remove this line - it's not needed
    // const fragment = document.createDocumentFragment()

    videos.forEach((video) => {
      this.videoManager.upsert(video)
    })

    // Single forced reflow after all updates
    if (videos.length > 0) {
      requestAnimationFrame(() => {
        videos.forEach((v) => {
          if (v instanceof HTMLElement) {
            void v.offsetHeight
          }
        })
      })
    }
  }

  /**
   * Event delegation - no timing hacks
   * CRITICAL FIX: Use capture phase (true) to intercept before YouTube handlers
   */
  private listen(): void {
    // Hover → show metadata
    document.addEventListener(
      "mouseover",
      (e) => {
        const target = e.target as HTMLElement
        const overlay = target.closest(".boyo-overlay") as HTMLElement
        if (!overlay || !overlay.dataset.videoId) return

        console.log("[BOYO] Hover detected on", overlay.dataset.videoId)
        this.videoManager.transition(overlay.dataset.videoId, "HOVER")
      },
      { capture: true, passive: true }
    ) // Use options object for better control

    // CRITICAL FIX: Single click needs to check current level
    // If already at METADATA, advance to TITLE
    document.addEventListener(
      "click",
      (e) => {
        const target = e.target as HTMLElement
        const overlay = target.closest(".boyo-overlay") as HTMLElement
        if (!overlay || !overlay.dataset.videoId) return

        console.log("[BOYO] Click detected on", overlay.dataset.videoId)

        // Stop YouTube from handling the click
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation() // CRITICAL: Stop other handlers

        this.videoManager.transition(overlay.dataset.videoId, "CLICK")
      },
      { capture: true }
    ) // Capture phase is critical

    // Double-click → full reveal
    document.addEventListener(
      "dblclick",
      (e) => {
        const target = e.target as HTMLElement
        const overlay = target.closest(".boyo-overlay") as HTMLElement
        if (!overlay || !overlay.dataset.videoId) return

        console.log("[BOYO] Double-click detected on", overlay.dataset.videoId)

        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()

        this.videoManager.transition(overlay.dataset.videoId, "DBLCLICK")
      },
      { capture: true }
    )

    // Right-click → whitelist menu
    document.addEventListener(
      "contextmenu",
      (e) => {
        const target = e.target as HTMLElement
        const overlay = target.closest(".boyo-overlay") as HTMLElement
        if (!overlay || !overlay.dataset.videoId) return

        console.log("[BOYO] Context menu on", overlay.dataset.videoId)

        e.preventDefault()
        this.showContextMenu(e, overlay.dataset.videoId)
      },
      { capture: true }
    )
  }

  /**
   * Observe DOM mutations for new videos
   * Handles infinite scroll and dynamic content
   */
  private observe(): void {
    const observer = new MutationObserver((mutations) => {
      // Process synchronously within the same task
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue

          if (node.matches(VIDEO_SELECTOR_STRING)) {
            this.videoManager.upsert(node)
            // Force immediate render for this node
            void node.offsetHeight
          } else {
            const videos = node.querySelectorAll(VIDEO_SELECTOR_STRING)
            videos.forEach((video) => {
              this.videoManager.upsert(video)
              if (video instanceof HTMLElement) {
                void video.offsetHeight
              }
            })
          }
        }
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href", "video-id", "data-context-item-id"],
    })
  }

  /**
   * Handle YouTube SPA navigation - CRITICAL
   * YouTube never reloads the page, just mutates content
   */
  private handleSPANavigation(): void {
    // Method 1: YouTube's native navigation events
    window.addEventListener("yt-navigate-start", () => {
      console.log("[BOYO] YouTube navigation started")
    })

    window.addEventListener("yt-navigate-finish", () => {
      console.log("[BOYO] YouTube navigation finished, rescanning")

      // Reset state on navigation
      this.videoManager.reset()

      // Scan new content
      setTimeout(() => this.scan(), 500)
    })

    // Method 2: YouTube page data updates
    window.addEventListener("yt-page-data-updated", () => {
      console.log("[BOYO] YouTube page data updated, rescanning")
      setTimeout(() => this.scan(), 300)
    })

    // Method 3: URL change detection (fallback)
    // Handles cases where YouTube events don't fire
    setInterval(() => {
      const currentUrl = location.href
      if (currentUrl !== this.lastUrl) {
        console.log(
          "[BOYO] URL change detected:",
          this.lastUrl,
          "→",
          currentUrl
        )
        this.lastUrl = currentUrl

        // Reset and rescan
        this.videoManager.reset()
        setTimeout(() => this.scan(), 500)
      }
    }, 1000)

    // Method 4: Visibility change (tab becomes active)
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        console.log("[BOYO] Tab became visible, rescanning")
        setTimeout(() => this.scan(), 300)
      }
    })
  }

  /**
   * Show context menu for whitelisting
   */
  private showContextMenu(_e: MouseEvent, videoId: string): void {
    const video = this.videoManager.getVideo(videoId)
    if (!video) return

    const result = confirm(
      "Add this channel to whitelist?\n\n" +
        "(Always show content from this channel)"
    )

    if (result) {
      this.videoManager.addChannelToWhitelist(videoId)
    }
  }
}

// Initialize
const controller = new ContentController()
controller.initialize()
