import type { SceneNote } from "@some-ui/topik"
import type { BlobShelf, Recording } from "@some-ui/voice-capture"
import { ShelfFullError } from "@some-ui/voice-capture"
import { describe, expect, it, vi } from "vitest"

import { SCENE_NOTES_MAX } from "@/lib/scene-voice/budget"
import type { SceneVoicePorts } from "@/lib/scene-voice/runtime"
import { createSceneVoice } from "@/lib/scene-voice/runtime"

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
  overrides: Partial<SceneVoicePorts> = {},
  listed: Array<SceneNote> = []
): SceneVoicePorts & { listed: Array<SceneNote>; audio: BlobShelf } {
  const audio: BlobShelf = {
    put: vi.fn(() => Promise.resolve()),
    get: () => Promise.resolve(null),
    remove: vi.fn(() => Promise.resolve()),
    ids: () => Promise.resolve([]),
  }
  let now = 0
  let next = 0
  return {
    listed,
    startRecording: () => Promise.resolve(recording(4_000)),
    audio,
    notes: {
      read: () => [...listed],
      add: (note): boolean => {
        listed.push(note)
        return true
      },
      remove: (ids): boolean => {
        listed.splice(
          0,
          listed.length,
          ...listed.filter(({ id }) => !ids.includes(id))
        )
        return true
      },
    },
    saving: vi.fn(),
    now: () => (now += 2_000),
    newId: () => `n${(next += 1)}`,
    ...overrides,
  }
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

/** One take, start to kept. */
async function talk(voice: ReturnType<typeof createSceneVoice>): Promise<void> {
  voice.start()
  await settle()
  voice.stop()
  await settle()
}

describe("createSceneVoice", () => {
  it("keeps each take as a note in the draft: its audio, then its entry", async () => {
    const p = ports()
    const voice = createSceneVoice(p)
    await talk(voice)
    await talk(voice)
    expect(p.audio.put).toHaveBeenCalledTimes(2)
    expect(voice.getSnapshot()).toMatchObject({
      notes: [
        { id: "n1", durationMs: 4_000 },
        { id: "n2", durationMs: 4_000 },
      ],
      take: { kind: "idle" },
      said: "Kept.",
      full: false,
    })
  })

  it("lets notes go with their audio, and the last take's word with them", async () => {
    const p = ports()
    const voice = createSceneVoice(p)
    await talk(voice)
    voice.remove(["n1"])
    expect(p.audio.remove).toHaveBeenCalledWith(["n1"])
    expect(voice.getSnapshot()).toMatchObject({ notes: [], said: null })
  })

  it("lets go the notes home holds, and no other (LG1)", async () => {
    const p = ports()
    const voice = createSceneVoice(p)
    await talk(voice)
    await talk(voice)
    voice.letGo(new Set(["n2", "never-heard"]))
    expect(p.audio.remove).toHaveBeenCalledWith(["n2"])
    expect(voice.getSnapshot().notes.map(({ id }) => id)).toEqual(["n1"])
  })

  it("says the draft is full once the last note it holds is kept", async () => {
    const kept = Array.from({ length: SCENE_NOTES_MAX - 1 }, (_, index) => ({
      id: `kept-${index}`,
      durationMs: 1_000,
      mimeType: "audio/webm",
    }))
    const voice = createSceneVoice(ports({}, kept))
    await talk(voice)
    expect(voice.getSnapshot().full).toBe(true)
    expect(voice.getSnapshot().said).toContain("let one go")
  })

  it("opens on the draft already kept, and starts no take once it is full", () => {
    const full = Array.from({ length: SCENE_NOTES_MAX }, (_, index) => ({
      id: `kept-${index}`,
      durationMs: 1_000,
      mimeType: "audio/webm",
    }))
    const startRecording = vi.fn(() => Promise.resolve(recording(4_000)))
    const voice = createSceneVoice(ports({ startRecording }, full))
    expect(voice.getSnapshot()).toMatchObject({ full: true })
    expect(voice.getSnapshot().said).toContain("let one go")
    voice.start()
    expect(startRecording).not.toHaveBeenCalled()
  })

  it("says so when the shelf is full, and lists nothing it could not keep", async () => {
    const p = ports()
    p.audio.put = vi.fn(() => Promise.reject(new ShelfFullError()))
    const voice = createSceneVoice(p)
    await talk(voice)
    expect(p.listed).toEqual([])
    expect(voice.getSnapshot().said).toMatch(/no room/)
  })

  it("takes the audio back out when its entry cannot be listed", async () => {
    const p = ports()
    p.notes.add = (): boolean => false
    const voice = createSceneVoice(p)
    await talk(voice)
    expect(p.audio.remove).toHaveBeenCalledWith(["n1"])
    expect(voice.getSnapshot().said).toMatch(/Couldn't keep/)
  })
})
