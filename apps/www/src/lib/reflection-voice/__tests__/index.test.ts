/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import { letGoReflections } from "@/lib/reflection-voice"
import { reflections } from "@/lib/session-reflection"

const removeAudio = vi.hoisted(() => vi.fn(() => Promise.resolve()))

vi.mock("@some-ui/voice-capture", () => ({
  blobShelf: (): { remove: typeof removeAudio } => ({ remove: removeAudio }),
  micRecorder: vi.fn(),
}))

beforeEach(() => {
  localStorage.clear()
  removeAudio.mockClear()
  reflections.keep({
    id: "v1",
    sessionId: "s1",
    createdAt: "2026-10-10T09:00:00.000Z",
    atMs: 1_000,
    body: {
      kind: "voice",
      durationMs: 4_000,
      mimeType: "audio/webm",
      bytes: 3,
    },
  })
})

describe("letGoReflections", () => {
  it("removes the reflection, then its audio", () => {
    expect(letGoReflections(["v1"])).toBe(true)
    expect(reflections.getSnapshot().kept).toEqual([])
    expect(removeAudio).toHaveBeenCalledWith(["v1"])
  })

  it("keeps the audio when the phone would not store the removal", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError")
    })
    expect(letGoReflections(["v1"])).toBe(false)
    vi.restoreAllMocks()

    expect(reflections.getSnapshot().kept).toHaveLength(1)
    expect(removeAudio).not.toHaveBeenCalled()
  })
})
