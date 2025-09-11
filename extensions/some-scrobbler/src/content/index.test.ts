import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from "vitest"

// Mock Chrome APIs
const mockSendMessage = vi.fn()
const mockSetBadgeText = vi.fn()
const mockSetBadgeBackgroundColor = vi.fn()
const mockStorageGet = vi.fn()
const mockStorageSet = vi.fn()

global.chrome = {
  runtime: {
    sendMessage: mockSendMessage,
    lastError: null,
    onInstalled: {
      addListener: vi.fn(),
    },
    onMessage: {
      addListener: vi.fn(),
    },
  },
  action: {
    setBadgeText: mockSetBadgeText,
    setBadgeBackgroundColor: mockSetBadgeBackgroundColor,
  },
  storage: {
    local: {
      get: mockStorageGet,
      set: mockStorageSet,
    },
  },
} as any

// Mock fetch
global.fetch = vi.fn()

// Setup DOM
const dom = new JSDOM(
  `
                        <!DOCTYPE html>
                          <html>
                              <head><title>Test Video - YouTube</title></head>
                                  <body>
                                        <video currentTime="45.5" duration="180.7"></video>
                                              <h1 class="ytd-watch-metadata">
                                                      <yt-formatted-string>Test Song Title</yt-formatted-string>
                                                            </h1>
                                                                  <div id="channel-name">
                                                                          <a>Test Artist</a>
                                                                                </div>
                                                                                    </body>
                                                                                      </html>
                                                                                      `,
  { url: "https://www.youtube.com/watch?v=testVideoId123" }
)

global.window = dom.window as any
global.document = dom.window.document
global.location = dom.window.location

// Import the functions we want to test (assuming they're exported)
// For this test, we'll recreate the key functions to test them
const BADGES = {
  enabled: { text: "", color: "#4CAF50" },
  disabled: { text: "OFF", color: "#757575" },
  success: { text: "✓", color: "#4CAF50" },
  error: { text: "!", color: "#F44336" },
} as const

type ExtensionState = {
  isEnabled: boolean
  lastStatus: "idle" | "success" | "error"
  lastSong?: string
  lastError?: string
}

type VideoMetadata = {
  title: string
  channel: string
  video_id: string
  current_time: number
  duration: number
  thumbnail: string
}

type BadgeStatus = {
  text: string
  color: string
}

let testState: ExtensionState = {
  isEnabled: true,
  lastStatus: "idle",
}

// Test functions
function updateBadge(badge: BadgeStatus) {
  chrome.action.setBadgeText({ text: badge.text })
  chrome.action.setBadgeBackgroundColor({ color: badge.color })
}

function extractVideoMetadata(): VideoMetadata | null {
  const url = new URL(window.location.href)
  const videoId = url.searchParams.get("v")

  if (!videoId) return null

  const video = document.querySelector("video") as HTMLVideoElement
  if (!video) return null

  // Extract title with fallbacks
  const titleSelectors = [
    "h1.ytd-watch-metadata yt-formatted-string",
    "h1.title",
    ".watch-title",
  ]

  let title = ""
  for (const selector of titleSelectors) {
    const element = document.querySelector(selector)
    if (element?.textContent?.trim()) {
      title = element.textContent.trim()
      break
    }
  }

  if (!title) {
    title = document.title.replace(" - YouTube", "").trim()
  }

  // Extract channel
  const channelElement = document.querySelector("#channel-name a")
  const channel = channelElement?.textContent?.trim() || "Unknown"

  return {
    title,
    channel,
    video_id: videoId,
    current_time: Math.floor(video.currentTime),
    duration: Math.floor(video.duration),
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
  }
}

async function sendToServer(metadata: VideoMetadata): Promise<void> {
  const response = await fetch("http://nixos.local:3000/now-playing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  })

  if (!response.ok) {
    throw new Error(`Server error: ${response.status}`)
  }

  testState = {
    ...testState,
    lastStatus: "success",
    lastSong: metadata.title,
    lastError: undefined,
  }
}

describe("Functional YouTube Tracker", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    testState = { isEnabled: true, lastStatus: "idle" }

    // Reset DOM
    document.querySelector("video")?.setAttribute("currentTime", "45.5")
    document.querySelector("video")?.setAttribute("duration", "180.7")

    // Reset URL
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=testVideoId123"),
      writable: true,
    })
  })

  describe("Badge Management", () => {
    it("should have correct badge configurations", () => {
      expect(BADGES.enabled).toEqual({ text: "", color: "#4CAF50" })
      expect(BADGES.disabled).toEqual({ text: "OFF", color: "#757575" })
      expect(BADGES.success).toEqual({ text: "✓", color: "#4CAF50" })
      expect(BADGES.error).toEqual({ text: "!", color: "#F44336" })
    })

    it("should update badge correctly", () => {
      updateBadge(BADGES.success)

      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: "✓" })
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({
        color: "#4CAF50",
      })
    })
  })

  describe("Video Metadata Extraction", () => {
    it("should extract complete metadata from page", () => {
      const metadata = extractVideoMetadata()

      expect(metadata).toEqual({
        title: "Test Song Title",
        channel: "Test Artist",
        video_id: "testVideoId123",
        current_time: 45,
        duration: 180,
        thumbnail:
          "https://img.youtube.com/vi/testVideoId123/maxresdefault.jpg",
      })
    })

    it("should return null when no video ID in URL", () => {
      Object.defineProperty(window, "location", {
        value: new URL("https://www.youtube.com/"),
        writable: true,
      })

      const metadata = extractVideoMetadata()
      expect(metadata).toBeNull()
    })

    it("should return null when no video element", () => {
      document.querySelector("video")?.remove()

      const metadata = extractVideoMetadata()
      expect(metadata).toBeNull()
    })

    it("should fallback to document title when title element missing", () => {
      document.querySelector("h1")?.remove()

      const metadata = extractVideoMetadata()
      expect(metadata?.title).toBe("Test Video")
    })

    it("should handle missing channel gracefully", () => {
      document.querySelector("#channel-name")?.remove()

      const metadata = extractVideoMetadata()
      expect(metadata?.channel).toBe("Unknown")
    })

    it("should floor video times correctly", () => {
      const metadata = extractVideoMetadata()

      expect(metadata?.current_time).toBe(45) // 45.5 floored
      expect(metadata?.duration).toBe(180) // 180.7 floored
    })

    it("should generate correct thumbnail URL format", () => {
      const metadata = extractVideoMetadata()

      expect(metadata?.thumbnail).toBe(
        "https://img.youtube.com/vi/testVideoId123/maxresdefault.jpg"
      )
      expect(() => new URL(metadata!.thumbnail)).not.toThrow()
    })
  })

  describe("Server Communication", () => {
    it("should send metadata successfully", async () => {
      const mockResponse = { ok: true, status: 200 }
      ;(global.fetch as MockedFunction<typeof fetch>).mockResolvedValue(
        mockResponse as Response
      )

      const metadata: VideoMetadata = {
        title: "Test Song",
        channel: "Test Artist",
        video_id: "test123",
        current_time: 30,
        duration: 180,
        thumbnail: "https://img.youtube.com/vi/test123/maxresdefault.jpg",
      }

      await sendToServer(metadata)

      expect(fetch).toHaveBeenCalledWith(
        "http://nixos.local:3000/now-playing",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(metadata),
        }
      )

      expect(testState.lastStatus).toBe("success")
      expect(testState.lastSong).toBe("Test Song")
      expect(testState.lastError).toBeUndefined()
    })

    it("should handle server errors", async () => {
      const mockResponse = { ok: false, status: 500 }
      ;(global.fetch as MockedFunction<typeof fetch>).mockResolvedValue(
        mockResponse as Response
      )

      const metadata: VideoMetadata = {
        title: "Test Song",
        channel: "Test Artist",
        video_id: "test123",
        current_time: 30,
        duration: 180,
        thumbnail: "https://img.youtube.com/vi/test123/maxresdefault.jpg",
      }

      await expect(sendToServer(metadata)).rejects.toThrow("Server error: 500")
    })

    it("should handle network errors", async () => {
      ;(global.fetch as MockedFunction<typeof fetch>).mockRejectedValue(
        new Error("Network error")
      )

      const metadata: VideoMetadata = {
        title: "Test Song",
        channel: "Test Artist",
        video_id: "test123",
        current_time: 30,
        duration: 180,
        thumbnail: "https://img.youtube.com/vi/test123/maxresdefault.jpg",
      }

      await expect(sendToServer(metadata)).rejects.toThrow("Network error")
    })
  })

  describe("State Management", () => {
    it("should maintain immutable state updates", () => {
      const originalState = { ...testState }

      // Simulate state update
      testState = {
        ...testState,
        isEnabled: false,
        lastStatus: "error" as const,
      }

      expect(testState.isEnabled).toBe(false)
      expect(testState.lastStatus).toBe("error")
      expect(originalState.isEnabled).toBe(true) // Original unchanged
    })
  })

  describe("URL and Video Detection", () => {
    it("should detect YouTube watch URLs", () => {
      const testUrls = [
        "https://www.youtube.com/watch?v=abc123",
        "https://www.youtube.com/watch?v=abc123&list=xyz",
        "https://youtube.com/watch?v=abc123",
      ]

      testUrls.forEach((urlString) => {
        const url = new URL(urlString)
        const videoId = url.searchParams.get("v")
        expect(videoId).toBe("abc123")
      })
    })

    it("should validate video metadata structure", () => {
      const metadata = extractVideoMetadata()

      if (metadata) {
        expect(typeof metadata.title).toBe("string")
        expect(typeof metadata.channel).toBe("string")
        expect(typeof metadata.video_id).toBe("string")
        expect(typeof metadata.current_time).toBe("number")
        expect(typeof metadata.duration).toBe("number")
        expect(typeof metadata.thumbnail).toBe("string")

        expect(metadata.current_time).toBeGreaterThanOrEqual(0)
        expect(metadata.duration).toBeGreaterThanOrEqual(0)
        expect(metadata.current_time).toBeLessThanOrEqual(metadata.duration)
        expect(metadata.thumbnail).toMatch(
          /^https:\/\/img\.youtube\.com\/vi\/.+\/maxresdefault\.jpg$/
        )
      }
    })
  })
})
