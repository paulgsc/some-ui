
import { getAllVideoElements, VIDEO_SELECTOR_STRING } from "@censor/utils/dom"
import { storageAPI } from "@censor/utils/storage-api"
import { VideoManager } from "./video-manager"
import { initManager } from "./initialization-manager"
import "@censor/styles/content.css"

class ContentController {
  private videoManager: VideoManager
  private lastUrl: string = location.href
  private setupComplete = false

  constructor() {
    this.videoManager = new VideoManager()
  }

  async initialize(): Promise<void> {
    console.log("[BOYO] Initializing content script")
    
    await initManager.initializeClean()
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
    if (this.setupComplete) {
      console.warn("[BOYO] Setup already complete, skipping")
      return
    }

    console.log("[BOYO] Setting up BOYO")
    this.listen()
    this.observe()
    this.handleSPANavigation()
    
    // Initial scan after DOM is ready
    requestAnimationFrame(() => {
      this.scan()
      this.setupComplete = true
    })
  }

  private scan(): void {
    const videos = getAllVideoElements()
    console.log(`[BOYO] Scanning ${videos.length} videos`)
    
    let processed = 0
    let skipped = 0
    
    videos.forEach((video) => {
      const videoId = video.getAttribute("data-video-id")
      if (videoId) {
        this.videoManager.upsert(video)
        processed++
      } else {
        skipped++
      }
    })
    
    console.log(`[BOYO] Scan complete: ${processed} processed, ${skipped} skipped`)
  }

  /**
   * Event delegation
   */
  private listen(): void {
    console.log("[BOYO] Setting up event listeners")

    // Hover start
    document.addEventListener(
      "mouseover",
      (e) => {
        const overlay = (e.target as HTMLElement).closest(
          ".boyo-overlay"
        ) as HTMLElement
        if (!overlay?.dataset.videoId) return

        this.videoManager.handleHoverStart(overlay.dataset.videoId)
      },
      { capture: true, passive: true }
    )

    // Hover end
    document.addEventListener(
      "mouseout",
      (e) => {
        const overlay = (e.target as HTMLElement).closest(
          ".boyo-overlay"
        ) as HTMLElement
        if (!overlay?.dataset.videoId) return

        this.videoManager.handleHoverEnd(overlay.dataset.videoId)
      },
      { capture: true, passive: true }
    )

    // Click
    document.addEventListener(
      "click",
      (e) => {
        const overlay = (e.target as HTMLElement).closest(
          ".boyo-overlay"
        ) as HTMLElement
        if (!overlay?.dataset.videoId) return

        console.log("[BOYO] Click event captured on overlay", overlay.dataset.videoId)

        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()

        this.videoManager.handleClick(overlay.dataset.videoId)
      },
      { capture: true }
    )

    // Double-click
    document.addEventListener(
      "dblclick",
      (e) => {
        const overlay = (e.target as HTMLElement).closest(
          ".boyo-overlay"
        ) as HTMLElement
        if (!overlay?.dataset.videoId) return

        console.log("[BOYO] Double-click event captured on overlay", overlay.dataset.videoId)

        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()

        this.videoManager.handleDblClick(overlay.dataset.videoId)
      },
      { capture: true }
    )

    // Right-click → whitelist
    document.addEventListener(
      "contextmenu",
      (e) => {
        const overlay = (e.target as HTMLElement).closest(
          ".boyo-overlay"
        ) as HTMLElement
        if (!overlay?.dataset.videoId) return

        e.preventDefault()
        this.showContextMenu(overlay.dataset.videoId)
      },
      { capture: true }
    )
  }

  private observe(): void {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue

          if (node.matches(VIDEO_SELECTOR_STRING)) {
            this.videoManager.upsert(node)
          } else {
            node
              .querySelectorAll(VIDEO_SELECTOR_STRING)
              .forEach((video) => this.videoManager.upsert(video))
          }
        }
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }

  private handleSPANavigation(): void {
    window.addEventListener("yt-navigate-finish", () => {
      console.log("[BOYO] YouTube navigation detected")
      this.videoManager.reset()
      setTimeout(() => this.scan(), 500)
    })

    // URL change fallback
    setInterval(() => {
      if (location.href !== this.lastUrl) {
        console.log(`[BOYO] URL changed: ${this.lastUrl} → ${location.href}`)
        this.lastUrl = location.href
        this.videoManager.reset()
        setTimeout(() => this.scan(), 500)
      }
    }, 1000)
  }

  private showContextMenu(videoId: string): void {
    const confirmed = confirm(
      "Add this channel to whitelist?\n\n(Always show content)"
    )
    if (confirmed) {
      this.videoManager.addChannelToWhitelist(videoId)
    }
  }
}

const controller = new ContentController()
controller.initialize()
