/**
 * @vitest-environment jsdom
 */

import { simulatedMicrophone } from "@some-ui/voice-capture/testing"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  letGoReflections,
  onAudioSettled,
  phoneVoiceNote,
  sweepOrphans,
} from "@/lib/reflection-voice"
import { reflections } from "@/lib/session-reflection"

const removeAudio = vi.hoisted(() => vi.fn(() => Promise.resolve()))
/** The ids on the shelf. */
const shelved = vi.hoisted(() => new Set<string>())

// IndexedDB's stand-in: jsdom has none.
vi.mock("@some-ui/voice-capture", async (actual) => {
  const shelf = {
    put: (id: string): Promise<void> => {
      shelved.add(id)
      return Promise.resolve()
    },
    remove: removeAudio,
    ids: (): Promise<Array<string>> => Promise.resolve([...shelved]),
    get: (id: string): Promise<Blob | null> =>
      Promise.resolve(shelved.has(id) ? new Blob(["opus"]) : null),
  }
  return {
    ...(await actual<object>()),
    savingShelf: (): object => ({
      shelf: () => shelf,
      saving: vi.fn(),
      isSaving: () => false,
    }),
  }
})

function voice(id: string): void {
  reflections.keep({
    id,
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
}

beforeEach(() => {
  localStorage.clear()
  removeAudio.mockClear()
  shelved.clear()
  voice("v1")
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

describe("sweepOrphans", () => {
  it("removes audio no reflection names, and lets go of a voice note with no audio", async () => {
    shelved.add("v2").add("stray")
    voice("v2")

    sweepOrphans()
    await vi.waitFor(() => {
      expect(reflections.getSnapshot().kept.map((r) => r.id)).toEqual(["v2"])
    })
    expect(removeAudio).toHaveBeenCalledWith(["stray"])
  })
})

describe("onAudioSettled", () => {
  it("tells each listener once a take's audio is written, and not before", async () => {
    vi.useFakeTimers()
    const heard = vi.fn()
    const stop = onAudioSettled(heard)
    const mic = simulatedMicrophone({ now: Date.now })
    const voice = phoneVoiceNote("s1", mic.startRecording)
    voice.tap(null)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(heard).not.toHaveBeenCalled()
    voice.tap(null)
    await vi.advanceTimersByTimeAsync(0)
    expect(heard).toHaveBeenCalledTimes(1)
    stop()
    voice.tap(null)
    await vi.advanceTimersByTimeAsync(3_000)
    voice.tap(null)
    await vi.advanceTimersByTimeAsync(0)
    expect(heard).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
