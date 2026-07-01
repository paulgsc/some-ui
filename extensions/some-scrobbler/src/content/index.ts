import type { Message, VideoMetadata } from "./types"

class YouTubeTracker {
  private lastVideoId: string | null = null
  private isTracking = false
  private currentUrl = location.href
  private observer: MutationObserver

  constructor() {
    this.observer = new MutationObserver(this.handleNavigation.bind(this))
    this.init()
  }

  private init(): void {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", this.start.bind(this))
    } else {
      this.start()
    }
  }

  private start(): void {
    this.setupTracking()
    this.setupNavigationWatcher()
  }

  private setupTracking(): void {
    setTimeout(() => this.trackVideo(), 1000)
    setInterval(() => this.trackVideo(), 5000)

    document.addEventListener("play", () => this.trackVideo(), true)
    document.addEventListener("pause", () => this.handlePause(), true)
  }

  private setupNavigationWatcher(): void {
    this.observer.observe(document, { childList: true, subtree: true })
  }

  private handleNavigation(): void {
    if (location.href !== this.currentUrl) {
      this.currentUrl = location.href
      this.reset()
      setTimeout(() => this.setupTracking(), 1000)
    }
  }

  private reset(): void {
    this.lastVideoId = null
    this.isTracking = false
  }

  private handlePause(): void {
    if (this.isTracking) {
      this.reset()
    }
  }

  private getVideoId(): string | null {
    const url = new URL(window.location.href)
    return url.searchParams.get("v")
  }

  private isVideoPlaying(): boolean {
    const video = document.querySelector("video") as HTMLVideoElement
    return Boolean(
      video && !video.paused && !video.ended && video.readyState > 2
    )
  }

  private getVideoMetadata(): VideoMetadata | null {
    const video = document.querySelector("video") as HTMLVideoElement
    if (!video) return null

    const videoId = this.getVideoId()
    if (!videoId) return null

    const title = this.getTitle()
    const channel = this.getChannel()

    return {
      title,
      channel,
      video_id: videoId,
      current_time: Math.floor(video.currentTime),
      duration: Math.floor(video.duration) || 0,
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    }
  }

  private getTitle(): string {
    const selectors = [
      "h1.ytd-watch-metadata yt-formatted-string",
      "h1.title",
      ".watch-title",
    ]

    for (const selector of selectors) {
      const element = document.querySelector(selector)
      if (element?.textContent?.trim()) {
        return element.textContent.trim()
      }
    }

    return document.title.replace(" - YouTube", "")
  }

  private getChannel(): string {
    const selectors = [
      "#channel-name a",
      ".ytd-channel-name a",
      "#owner-text a",
    ]

    for (const selector of selectors) {
      const element = document.querySelector(selector)
      if (element?.textContent?.trim()) {
        return element.textContent.trim()
      }
    }

    return "Unknown Channel"
  }

  private trackVideo(): void {
    if (!this.isVideoPlaying()) {
      if (this.isTracking) {
        this.reset()
      }
      return
    }

    const metadata = this.getVideoMetadata()
    if (!metadata) return

    if (metadata.video_id !== this.lastVideoId || !this.isTracking) {
      this.sendToBackground(metadata)
      this.lastVideoId = metadata.video_id
      this.isTracking = true
    }
  }

  private sendToBackground(metadata: VideoMetadata): void {
    const message: Message = {
      type: "now-playing",
      payload: metadata,
    }

    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        // eslint-disable-next-line no-console
        console.log(
          "Failed to send to background:",
          chrome.runtime.lastError.message
        )
      }
    })
  }
}

new YouTubeTracker()
