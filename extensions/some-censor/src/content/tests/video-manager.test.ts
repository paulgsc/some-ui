import { VideoManager } from "@censor/content/video-manager"
import { DisclosureLevel } from "@censor/types"
import { storageAPI } from "@censor/utils/storage-api"
import { beforeEach, describe, expect, it, vi } from "vitest"

// --- Mock DOM helpers ---
vi.mock("@censor/utils/dom", () => ({
  extractVideoId: (el: HTMLElement) => el.dataset.videoId,
  extractChannelId: (el: HTMLElement) => el.dataset.channelId,
  extractMetadata: (el: HTMLElement) => ({ channelName: "Test Channel" }),
  extractTitle: (el: HTMLElement) => "Test Video",
  createOverlay: (id: string) => {
    const div = document.createElement("div")
    div.classList.add("boyo-overlay")
    return div
  },
  createMetadataDisplay: (m: any) => document.createElement("div"),
  createTitleDisplay: (t: string) => document.createElement("div"),
}))

// --- Mock storage API ---
vi.mock("@censor/utils/storage-api", () => ({
  storageAPI: {
    isWhitelisted: vi.fn(async () => false),
    addToWhitelist: vi.fn(async () => {}),
  },
}))

/**
 * Helper to quickly create and upsert a video element into the manager.
 */
const seedVideo = (
  manager: VideoManager,
  videoId: string,
  channelId: string = "chan1"
) => {
  const el = document.createElement("div")
  el.dataset.videoId = videoId
  el.dataset.channelId = channelId // Must be awaited in a real test context, but for the helper,
  // it's okay to let it run in the background if the test flow allows.
  // Since the new test is sync after the setup, a manual await in the test is cleaner.
  manager.upsert(el)
  return el
}

describe("VideoManager Invariants", () => {
  let manager: VideoManager
  let videoEl: HTMLElement

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new VideoManager()
    videoEl = document.createElement("div")
    videoEl.dataset.videoId = "vid1"
    videoEl.dataset.channelId = "chan1"
  }) // --- Upsert Idempotency ---

  it("upsert is idempotent for same element", async () => {
    await manager.upsert(videoEl)
    expect(manager.getVideoCount()).toBe(1)

    await manager.upsert(videoEl)
    expect(manager.getVideoCount()).toBe(1)
  })

  it("upsert replaces old element on reuse", async () => {
    await manager.upsert(videoEl)

    const newEl = document.createElement("div")
    newEl.dataset.videoId = "vid1"
    newEl.dataset.channelId = "chan1"

    await manager.upsert(newEl)
    expect(manager.getVideo("vid1")?.element).toBe(newEl)
    expect(videoEl.querySelector(".boyo-overlay")).toBeNull()
  }) // --- FSM Transitions ---

  it("FSM transitions correctly for HOVER -> METADATA -> CLICK -> TITLE -> DBLCLICK -> REVEALED", async () => {
    await manager.upsert(videoEl)

    manager.transition("vid1", "HOVER")
    expect(manager.getVideo("vid1")?.level).toBe(DisclosureLevel.METADATA)

    manager.transition("vid1", "CLICK")
    expect(manager.getVideo("vid1")?.level).toBe(DisclosureLevel.TITLE)

    manager.transition("vid1", "DBLCLICK")
    expect(manager.getVideo("vid1")?.level).toBe(DisclosureLevel.REVEALED)
  })

  it("invalid transitions do not change level", async () => {
    await manager.upsert(videoEl)

    manager.transition("vid1", "CLICK") // MASKED + CLICK => no transition
    expect(manager.getVideo("vid1")?.level).toBe(DisclosureLevel.MASKED)
  }) // 🆕 NEW TEST CASE 🆕

  it("never reacts to hover after reaching METADATA", async () => {
    // Using the helper for setup
    const vm = new VideoManager()
    await seedVideo(vm, "vid1") // Await added for completeness with upsert

    vm.transition("vid1", "HOVER") // MASKED → METADATA
    expect(vm.getVideo("vid1")!.level).toBe(DisclosureLevel.METADATA) // Transition further to another level past METADATA
    vm.transition("vid1", "CLICK") // METADATA → TITLE

    const levelBeforeHover = vm.getVideo("vid1")!.level // Should be TITLE (2)

    vm.transition("vid1", "HOVER") // Should be ignored at level > MASKED

    expect(vm.getVideo("vid1")!.level).toBe(levelBeforeHover)
    expect(vm.getVideo("vid1")!.level).toBe(DisclosureLevel.TITLE) // Explicitly check the expected level
  }) // --- Overlay consistency ---

  it("overlay exists for MASKED, METADATA, TITLE, removed only for REVEALED", async () => {
    await manager.upsert(videoEl)
    expect(videoEl.querySelector(".boyo-overlay")).not.toBeNull()

    manager.transition("vid1", "HOVER") // METADATA
    expect(videoEl.querySelector(".boyo-overlay")).not.toBeNull()

    manager.transition("vid1", "CLICK") // TITLE
    expect(videoEl.querySelector(".boyo-overlay")).not.toBeNull()

    manager.transition("vid1", "DBLCLICK") // REVEALED
    expect(videoEl.querySelector(".boyo-overlay")).toBeNull()
  })

  it("overlay data-level matches video.level", async () => {
    await manager.upsert(videoEl)
    let overlay = videoEl.querySelector(".boyo-overlay") as HTMLElement
    expect(overlay.dataset.level).toBe(String(DisclosureLevel.MASKED))

    manager.transition("vid1", "HOVER")
    overlay = videoEl.querySelector(".boyo-overlay") as HTMLElement
    expect(overlay.dataset.level).toBe(String(DisclosureLevel.METADATA))
  }) // --- Reset behavior ---

  it("reset cleans up all videos and overlays", async () => {
    await manager.upsert(videoEl)
    expect(manager.getVideoCount()).toBe(1)

    manager.reset()
    expect(manager.getVideoCount()).toBe(0)
    expect(videoEl.querySelector(".boyo-overlay")).toBeNull()
  }) // --- Whitelist behavior ---

  it("adding channel to whitelist reveals all videos of that channel", async () => {
    await manager.upsert(videoEl)

    const video2 = document.createElement("div")
    video2.dataset.videoId = "vid2"
    video2.dataset.channelId = "chan1"
    await manager.upsert(video2)

    await manager.addChannelToWhitelist("vid1")

    expect(manager.getVideo("vid1")?.level).toBe(DisclosureLevel.REVEALED)
    expect(manager.getVideo("vid2")?.level).toBe(DisclosureLevel.REVEALED)
    expect(storageAPI.addToWhitelist).toHaveBeenCalled()
  }) // --- Edge cases ---

  it("non-HTMLElement upsert is ignored", async () => {
    // @ts-expect-error passing invalid type
    await manager.upsert({})
    expect(manager.getVideoCount()).toBe(0)
  })

  it("transition of unknown videoId is ignored", () => {
    manager.transition("unknown", "CLICK")
    expect(manager.getVideoCount()).toBe(0)
  })
})
