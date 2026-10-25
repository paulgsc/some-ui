/**
 * @vitest-environment jsdom
 */

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

vi.mock("@some-ui/voice-capture", () => {
  const shelf = {
    remove: removeAudio,
    ids: (): Promise<Array<string>> => Promise.resolve([...shelved]),
    get: (id: string): Promise<Blob | null> =>
      Promise.resolve(shelved.has(id) ? new Blob(["opus"]) : null),
  }
  return {
    savingShelf: (): object => ({
      shelf: () => shelf,
      saving: vi.fn(),
      isSaving: () => false,
    }),
    micRecorder: vi.fn(),
  }
})

/** The `saving` port the runtime was made with. */
const ports = vi.hoisted(
  () => new Map<"saving", (id: string, writing: boolean) => void>()
)

vi.mock("@/lib/reflection-voice/runtime", () => ({
  createVoiceNote: (made: {
    saving: (id: string, writing: boolean) => void
  }): object => {
    ports.set("saving", made.saving)
    return {}
  },
}))

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
  it("tells each listener when a take's audio is written, and not while it is", () => {
    const heard = vi.fn()
    const stop = onAudioSettled(heard)
    phoneVoiceNote("s1")
    const saving = ports.get("saving")
    saving?.("v2", true)
    expect(heard).not.toHaveBeenCalled()
    saving?.("v2", false)
    expect(heard).toHaveBeenCalledTimes(1)
    stop()
    saving?.("v3", false)
    expect(heard).toHaveBeenCalledTimes(1)
  })
})
