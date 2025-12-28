import { VideoManager } from "@censor/content/video-manager"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock the CSS import
vi.mock("@censor/styles/content.css", () => ({}))

// Store original VideoManager for spy
let videoManagerSpy: {
  upsert: ReturnType<typeof vi.fn>
  transition: ReturnType<typeof vi.fn>
  reset: ReturnType<typeof vi.fn>
  getVideo: ReturnType<typeof vi.fn>
  addChannelToWhitelist: ReturnType<typeof vi.fn>
}

// Mock VideoManager constructor to capture instance
vi.mock("../video-manager", () => ({
  VideoManager: vi.fn().mockImplementation(() => {
    videoManagerSpy = {
      upsert: vi.fn(),
      transition: vi.fn(),
      reset: vi.fn(),
      getVideo: vi.fn(),
      addChannelToWhitelist: vi.fn(),
    }
    return videoManagerSpy
  }),
}))

// Mock DOM utilities
const mockGetAllVideoElements = vi.fn(() => [])
vi.mock("@censor/utils/dom", () => ({
  VIDEO_SELECTOR_STRING: "[data-video-id]",
  getAllVideoElements: mockGetAllVideoElements,
  extractVideoId: (el: HTMLElement) => el.dataset.videoId,
  extractChannelId: (el: HTMLElement) => el.dataset.channelId,
  extractMetadata: (el: HTMLElement) => ({ channelName: "Test Channel" }),
  extractTitle: (el: HTMLElement) => "Test Video",
  createOverlay: (videoId: string) => {
    const div = document.createElement("div")
    div.classList.add("boyo-overlay")
    div.dataset.videoId = videoId
    return div
  },
  createMetadataDisplay: (m: any) => {
    const div = document.createElement("div")
    div.className = "metadata"
    div.textContent = m.channelName
    return div
  },
  createTitleDisplay: (t: string) => {
    const div = document.createElement("div")
    div.className = "title"
    div.textContent = t
    return div
  },
}))

// Mock storage API
vi.mock("@censor/utils/storage-api", () => ({
  storageAPI: {
    initialize: vi.fn(async () => {}),
    isWhitelisted: vi.fn(async () => false),
    addToWhitelist: vi.fn(async () => {}),
  },
}))

describe("ContentController Event Integration", () => {
  // Track loaded modules to clean them up
  let contentModule: any

  beforeEach(async () => {
    vi.clearAllMocks()
    document.body.innerHTML = ""

    // Setup YouTube app structure BEFORE loading content script
    const ytdApp = document.createElement("ytd-app")
    document.body.appendChild(ytdApp)

    // Now import and initialize content script
    // Use import() to get a fresh instance each test
    contentModule = await import("../content")

    // Wait for initialization
    await new Promise((resolve) => setTimeout(resolve, 150))
  })

  afterEach(() => {
    // Clean up any timers
    vi.clearAllTimers()
  })

  const createVideoElement = (videoId: string, channelId: string) => {
    const video = document.createElement("div")
    video.dataset.videoId = videoId
    video.dataset.channelId = channelId
    video.classList.add("boyo-masked")

    const overlay = document.createElement("div")
    overlay.classList.add("boyo-overlay")
    overlay.dataset.videoId = videoId

    video.appendChild(overlay)
    document.body.appendChild(video)

    return { video, overlay }
  }

  it("hover event triggers HOVER transition", async () => {
    const { overlay } = createVideoElement("vid1", "chan1")

    // Simulate hover
    const hoverEvent = new MouseEvent("mouseover", {
      bubbles: true,
      cancelable: true,
    })
    overlay.dispatchEvent(hoverEvent)

    // Wait a tick for event to propagate
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(videoManagerSpy.transition).toHaveBeenCalledWith("vid1", "HOVER")
  })

  it("click event triggers CLICK transition and prevents default", async () => {
    const { overlay } = createVideoElement("vid1", "chan1")

    // Simulate click
    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    })
    const prevented = !overlay.dispatchEvent(clickEvent)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(videoManagerSpy.transition).toHaveBeenCalledWith("vid1", "CLICK")
    expect(prevented).toBe(true) // Event was prevented
  })

  it("double-click event triggers DBLCLICK transition", async () => {
    const { overlay } = createVideoElement("vid1", "chan1")

    // Simulate double-click
    const dblClickEvent = new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
    })
    overlay.dispatchEvent(dblClickEvent)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(videoManagerSpy.transition).toHaveBeenCalledWith("vid1", "DBLCLICK")
  })

  it("events on overlay children bubble to overlay", async () => {
    const { overlay } = createVideoElement("vid1", "chan1")

    // Add a child element
    const child = document.createElement("div")
    child.className = "overlay-content"
    overlay.appendChild(child)

    // Click on child
    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    })
    child.dispatchEvent(clickEvent)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(videoManagerSpy.transition).toHaveBeenCalledWith("vid1", "CLICK")
  })

  it("events outside overlay are ignored", async () => {
    createVideoElement("vid1", "chan1")

    // Create a separate element not inside overlay
    const outsideEl = document.createElement("div")
    document.body.appendChild(outsideEl)

    // Click outside
    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    })
    outsideEl.dispatchEvent(clickEvent)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(videoManagerSpy.transition).not.toHaveBeenCalled()
  })

  it("overlay without videoId is ignored", async () => {
    const overlay = document.createElement("div")
    overlay.classList.add("boyo-overlay")
    // No dataset.videoId set
    document.body.appendChild(overlay)

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    })
    overlay.dispatchEvent(clickEvent)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(videoManagerSpy.transition).not.toHaveBeenCalled()
  })
})

describe("ContentController Event Sequences", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    document.body.innerHTML = ""

    const ytdApp = document.createElement("ytd-app")
    document.body.appendChild(ytdApp)

    await import("../content")
    await new Promise((resolve) => setTimeout(resolve, 150))
  })

  it("multiple clicks on same overlay trigger multiple transitions", async () => {
    const video = document.createElement("div")
    video.dataset.videoId = "vid1"
    video.dataset.channelId = "chan1"
    const overlay = document.createElement("div")
    overlay.classList.add("boyo-overlay")
    overlay.dataset.videoId = "vid1"
    video.appendChild(overlay)
    document.body.appendChild(video)

    // First click
    overlay.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    )
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Second click
    overlay.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    )
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(videoManagerSpy.transition).toHaveBeenCalledTimes(2)
    expect(videoManagerSpy.transition).toHaveBeenNthCalledWith(
      1,
      "vid1",
      "CLICK"
    )
    expect(videoManagerSpy.transition).toHaveBeenNthCalledWith(
      2,
      "vid1",
      "CLICK"
    )
  })

  it("hover then click triggers both transitions in order", async () => {
    const video = document.createElement("div")
    video.dataset.videoId = "vid1"
    video.dataset.channelId = "chan1"
    const overlay = document.createElement("div")
    overlay.classList.add("boyo-overlay")
    overlay.dataset.videoId = "vid1"
    video.appendChild(overlay)
    document.body.appendChild(video)

    // Hover
    overlay.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Click
    overlay.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    )
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(videoManagerSpy.transition).toHaveBeenCalledTimes(2)
    expect(videoManagerSpy.transition).toHaveBeenNthCalledWith(
      1,
      "vid1",
      "HOVER"
    )
    expect(videoManagerSpy.transition).toHaveBeenNthCalledWith(
      2,
      "vid1",
      "CLICK"
    )
  })
})
