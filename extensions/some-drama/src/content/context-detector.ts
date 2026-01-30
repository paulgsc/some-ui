// Context Detection - Detect drama title, episode, timestamp from page
import type { DramaContext } from "@/types/schema"

export class ContextDetector {
  detectContext(): DramaContext {
    return {
      dramaTitle: this.detectDramaTitle(),
      episode: this.detectEpisode(),
      timestamp: this.detectTimestamp(),
    }
  }

  private detectDramaTitle(): string {
    // Try common streaming platform patterns
    const titleEl = document.querySelector("title")
    const title = titleEl?.textContent || ""

    // Remove common patterns like " - Episode X", " | Platform Name", etc.
    const cleanTitle = title
      .split(/[-|–—]/)[0] // Split by dash/pipe
      .replace(/\s*(?:Ep|Episode)\s*\d+/i, "") // Remove episode numbers
      .replace(/\s*Season\s*\d+/i, "") // Remove season numbers
      .trim()

    return cleanTitle || "Unknown Drama"
  }

  private detectEpisode(): number {
    // Try to extract from page title
    const titleEl = document.querySelector("title")
    const title = titleEl?.textContent || ""

    const episodeMatch = title.match(/(?:Ep|Episode)\s*(\d+)/i)
    if (episodeMatch) {
      return parseInt(episodeMatch[1], 10)
    }

    // Try common episode indicator selectors
    const episodeIndicators = [
      ".episode-number",
      ".current-episode",
      "[data-episode]",
      ".video-title .episode",
    ]

    for (const selector of episodeIndicators) {
      const el = document.querySelector(selector)
      if (el) {
        const text = el.textContent || el.getAttribute("data-episode") || ""
        const match = text.match(/\d+/)
        if (match) {
          return parseInt(match[0], 10)
        }
      }
    }

    return 1 // Default to episode 1
  }

  private detectTimestamp(): number {
    // Try to find video element
    const videoEl = document.querySelector("video") as HTMLVideoElement
    if (videoEl && !isNaN(videoEl.currentTime)) {
      return Math.floor(videoEl.currentTime)
    }

    // Try HTML5 video player controls
    const timeDisplay = document.querySelector(
      ".video-time-current, .current-time"
    )
    if (timeDisplay) {
      const timeText = timeDisplay.textContent || ""
      const seconds = this.parseTimeString(timeText)
      if (seconds > 0) return seconds
    }

    return 0
  }

  private parseTimeString(timeStr: string): number {
    // Parse formats like "12:34", "1:23:45", etc.
    const parts = timeStr.split(":").map((p) => parseInt(p.trim(), 10))

    if (parts.length === 2) {
      // MM:SS
      return parts[0] * 60 + parts[1]
    } else if (parts.length === 3) {
      // HH:MM:SS
      return parts[0] * 3600 + parts[1] * 60 + parts[2]
    }

    return 0
  }

  // Get current video element for live tracking
  getVideoElement(): HTMLVideoElement | null {
    return document.querySelector("video")
  }
}
