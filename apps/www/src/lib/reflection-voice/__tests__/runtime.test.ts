import type { BlobShelf, Recording } from "@some-ui/voice-capture"
import { ShelfFullError } from "@some-ui/voice-capture"
import { describe, expect, it, vi } from "vitest"

import type { VoicePorts } from "@/lib/reflection-voice/runtime"
import { createVoiceNote } from "@/lib/reflection-voice/runtime"
import type { Reflection } from "@/lib/session-reflection"

// eslint-disable-next-line one-owner/no-hand-written-microphone -- goes with voiceNoteRuntime when reflection voice moves onto the take pattern (MIC5, #2444)
function recording(durationMs: number): Recording {
  return {
    level: () => 0,
    finish: () =>
      Promise.resolve({
        blob: new Blob(["abc"]),
        mimeType: "audio/webm",
        durationMs,
      }),
    discard: vi.fn(),
  }
}

function ports(
  overrides: Partial<VoicePorts> = {}
): VoicePorts & { kept: Array<Reflection> } {
  const kept: Array<Reflection> = []
  const audio: BlobShelf = {
    put: vi.fn(() => Promise.resolve()),
    get: () => Promise.resolve(null),
    remove: vi.fn(() => Promise.resolve()),
    ids: () => Promise.resolve([]),
  }
  let now = 0
  return {
    kept,
    startRecording: () => Promise.resolve(recording(4_000)),
    audio,
    keep: (r): "kept" => {
      kept.push(r)
      return "kept"
    },
    letGo: vi.fn(),
    saving: vi.fn(),
    now: () => (now += 2_000),
    newId: () => "v1",
    ...overrides,
  }
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe("createVoiceNote", () => {
  it("keeps the reflection with its session and moment, then its audio", async () => {
    const p = ports()
    const note = createVoiceNote(p, "s1")
    note.start(90_000)
    await settle()
    note.stop()
    await settle()

    expect(p.kept).toEqual([
      {
        id: "v1",
        sessionId: "s1",
        createdAt: expect.any(String),
        atMs: 90_000,
        body: {
          kind: "voice",
          durationMs: 4_000,
          mimeType: "audio/webm",
          bytes: 3,
        },
      },
    ])
    expect(p.audio.put).toHaveBeenCalledWith("v1", expect.any(Blob))
    expect(note.getSnapshot()).toEqual({ kind: "idle", last: "kept" })
  })

  it("stores no audio when the reflection could not be kept", async () => {
    const p = ports({ keep: () => "failed" })
    const note = createVoiceNote(p, "s1")
    note.start(null)
    await settle()
    note.stop()
    await settle()

    expect(p.audio.put).not.toHaveBeenCalled()
    expect(note.getSnapshot()).toEqual({ kind: "idle", last: "failed" })
  })

  it("takes the reflection back out when its audio cannot be kept", async () => {
    const p = ports()
    p.audio.put = (): Promise<never> => Promise.reject(new ShelfFullError())
    const note = createVoiceNote(p, "s1")
    note.start(null)
    await settle()
    note.stop()
    await settle()

    expect(p.letGo).toHaveBeenCalledWith(["v1"])
    expect(note.getSnapshot()).toEqual({ kind: "idle", last: "full" })
  })
})
