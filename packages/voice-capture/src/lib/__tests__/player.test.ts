/**
 * VC4 (`lib/take-pattern.ts`): the kit's player stops a playback, pausing
 * its `Audio` and revoking its object URL, when it ends, when it is
 * stopped, and when the page is hidden; on a page already hidden it plays
 * nothing.
 */
import { simulatedPage } from "@voice-capture/lib/pattern-testing"
import { elementPlayer } from "@voice-capture/lib/player"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

class FakeAudio {
  static made: Array<FakeAudio> = []
  static refuse = false
  playing = false
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(readonly src: string) {
    FakeAudio.made.push(this)
  }
  play(): Promise<void> {
    if (FakeAudio.refuse) return Promise.reject(new Error("NotAllowedError"))
    this.playing = true
    return Promise.resolve()
  }
  pause(): void {
    this.playing = false
  }
}

describe("the kit's player (VC4)", () => {
  const revoked: Array<string> = []
  beforeEach(() => {
    FakeAudio.made = []
    FakeAudio.refuse = false
    revoked.length = 0
    let n = 0
    vi.stubGlobal("Audio", FakeAudio)
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:${++n}`)
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => {
      revoked.push(url)
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("stops when the page is hidden: paused, its URL revoked, ended, no longer watching", async () => {
    const page = simulatedPage()
    const playback = elementPlayer(page.watch).play(new Blob(["a"]))
    const [audio] = FakeAudio.made
    expect(audio?.playing).toBe(true)
    expect(page.watchers()).toBe(1)
    page.hide()
    expect(audio?.playing).toBe(false)
    expect(revoked).toEqual(["blob:1"])
    await expect(playback.ended).resolves.toBeUndefined()
    expect(page.watchers()).toBe(0)
  })

  it("plays nothing on a page already hidden", async () => {
    const page = simulatedPage(true)
    const playback = elementPlayer(page.watch).play(new Blob(["a"]))
    expect(FakeAudio.made[0]?.playing).toBe(false)
    expect(revoked).toEqual(["blob:1"])
    await expect(playback.ended).resolves.toBeUndefined()
    expect(page.watchers()).toBe(0)
  })

  it("lets go of the page once it ends or is stopped, revoking once", () => {
    const page = simulatedPage()
    const player = elementPlayer(page.watch)
    player.play(new Blob(["a"]))
    FakeAudio.made[0]?.onended?.()
    const stopped = player.play(new Blob(["b"]))
    stopped.stop()
    stopped.stop()
    expect(page.watchers()).toBe(0)
    expect(revoked).toEqual(["blob:1", "blob:2"])
    page.hide()
    expect(revoked).toEqual(["blob:1", "blob:2"])
  })

  it.each(["play() is refused", "the media fails"] as const)(
    "ends, revoked and unwatched, when %s",
    async (how) => {
      const page = simulatedPage()
      FakeAudio.refuse = how === "play() is refused"
      const playback = elementPlayer(page.watch).play(new Blob(["a"]))
      if (how === "the media fails") FakeAudio.made[0]?.onerror?.()
      await expect(playback.ended).resolves.toBeUndefined()
      expect(revoked).toEqual(["blob:1"])
      expect(page.watchers()).toBe(0)
    }
  )
})
