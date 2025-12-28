import { VideoManager } from "@censor/content/video-manager"
import { DisclosureLevel } from "@censor/types"
// Use the real DOM utilities (not mocked)
import * as domUtils from "@censor/utils/dom"
// Mock storage API only
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@censor/utils/storage-api", () => ({
  storageAPI: {
    isWhitelisted: vi.fn(async () => false),
    addToWhitelist: vi.fn(async () => {}),
  },
}))

describe("Visual State Verification", () => {
  let manager: VideoManager
  let videoEl: HTMLElement

  beforeEach(async () => {
    manager = new VideoManager()

    // Create a realistic video element structure
    videoEl = document.createElement("ytd-video-renderer")
    videoEl.dataset.videoId = "test123"
    videoEl.dataset.channelId = "channel123"

    // Add realistic child elements that extractors look for
    const channelName = document.createElement("yt-formatted-string")
    channelName.textContent = "Test Channel"
    const channelNameContainer = document.createElement("div")
    channelNameContainer.id = "channel-name"
    channelNameContainer.appendChild(channelName)
    videoEl.appendChild(channelNameContainer)

    const videoTitle = document.createElement("a")
    videoTitle.id = "video-title"
    videoTitle.textContent = "Amazing Test Video"
    videoEl.appendChild(videoTitle)

    const duration = document.createElement("span")
    duration.className = "ytd-thumbnail-overlay-time-status-renderer"
    duration.textContent = "10:23"
    videoEl.appendChild(duration)

    document.body.appendChild(videoEl)

    await manager.upsert(videoEl)
  })

  it("MASKED (level 0): overlay exists with instruction text", () => {
    const overlay = videoEl.querySelector(".boyo-overlay") as HTMLElement
    expect(overlay).not.toBeNull()
    expect(overlay.dataset.level).toBe("0")
    expect(overlay.children.length).toBe(0) // No metadata/title yet
    expect(videoEl.classList.contains("boyo-masked")).toBe(true)
  })

  it("METADATA (level 1): overlay shows metadata, hides instruction", () => {
    manager.transition("test123", "HOVER")

    const overlay = videoEl.querySelector(".boyo-overlay") as HTMLElement
    expect(overlay.dataset.level).toBe("1")

    const metadata = overlay.querySelector(".boyo-metadata")
    expect(metadata).not.toBeNull()
    expect(metadata?.textContent).toContain("Test Channel")
    expect(metadata?.textContent).toContain("10:23")

    // Title should NOT be present yet
    const title = overlay.querySelector(".boyo-title")
    expect(title).toBeNull()
  })

  it("TITLE (level 2): overlay shows both metadata and title", () => {
    manager.transition("test123", "HOVER") // MASKED -> METADATA
    manager.transition("test123", "CLICK") // METADATA -> TITLE

    const overlay = videoEl.querySelector(".boyo-overlay") as HTMLElement
    expect(overlay.dataset.level).toBe("2")

    const metadata = overlay.querySelector(".boyo-metadata")
    expect(metadata).not.toBeNull()

    const title = overlay.querySelector(".boyo-title")
    expect(title).not.toBeNull()
    expect(title?.textContent).toBe("Amazing Test Video") // NOT obfuscated
  })

  it("REVEALED (level 3): overlay removed, video fully visible", () => {
    manager.transition("test123", "DBLCLICK")

    const overlay = videoEl.querySelector(".boyo-overlay")
    expect(overlay).toBeNull() // Overlay should be removed

    expect(videoEl.classList.contains("boyo-masked")).toBe(false)
    expect(videoEl.classList.contains("boyo-revealed")).toBe(true)
  })

  it("Progressive disclosure: full flow from MASKED to REVEALED", () => {
    // Start: MASKED
    let overlay = videoEl.querySelector(".boyo-overlay") as HTMLElement
    expect(overlay.dataset.level).toBe("0")
    expect(overlay.children.length).toBe(0)

    // Hover: MASKED -> METADATA
    manager.transition("test123", "HOVER")
    overlay = videoEl.querySelector(".boyo-overlay") as HTMLElement
    expect(overlay.dataset.level).toBe("1")
    expect(overlay.querySelector(".boyo-metadata")).not.toBeNull()
    expect(overlay.querySelector(".boyo-title")).toBeNull()

    // Click: METADATA -> TITLE
    manager.transition("test123", "CLICK")
    overlay = videoEl.querySelector(".boyo-overlay") as HTMLElement
    expect(overlay.dataset.level).toBe("2")
    expect(overlay.querySelector(".boyo-metadata")).not.toBeNull()
    expect(overlay.querySelector(".boyo-title")).not.toBeNull()

    // Double-click: TITLE -> REVEALED
    manager.transition("test123", "DBLCLICK")
    expect(videoEl.querySelector(".boyo-overlay")).toBeNull()
    expect(videoEl.classList.contains("boyo-revealed")).toBe(true)
  })
})
