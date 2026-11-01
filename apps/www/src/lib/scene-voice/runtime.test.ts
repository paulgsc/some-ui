import type { TakeKept } from "@some-ui/voice-capture"
import { microphoneOwner } from "@some-ui/voice-capture"
import {
  memoryShelf,
  simulatedMicrophone,
  simulatedPlayer,
} from "@some-ui/voice-capture/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SCENE_NOTES_KEPT, SCENE_NOTES_MAX } from "@/lib/scene-voice/budget"
import type {
  KeptSceneNote,
  PhoneSceneVoice,
  SceneVoicePorts,
} from "@/lib/scene-voice/runtime"
import {
  createSceneVoice,
  NEXT_SCENE,
  sweepNotes,
} from "@/lib/scene-voice/runtime"

/** The draft's list in memory, as the phone's keeps it (`./index`). */
function memoryNotes(
  listed: Array<KeptSceneNote>,
  stores = true,
  removes = (): boolean => true,
  asides = (): boolean => true
): SceneVoicePorts["notes"] {
  const write = (next: Array<KeptSceneNote>): boolean => {
    if (!stores) return false
    listed.splice(0, listed.length, ...next)
    return true
  }
  return {
    read: () => [...listed],
    add: (note, supersedes): boolean =>
      write([
        ...listed.map(
          (other): KeptSceneNote =>
            other.id === supersedes ? { ...other, standing: "earlier" } : other
        ),
        note,
      ]),
    remove: (ids): boolean =>
      removes() && write(listed.filter(({ id }) => !ids.includes(id))),
    prompted: (ids): boolean =>
      write(
        listed.map((note) =>
          ids.includes(note.id) ? { ...note, prompted: true } : note
        )
      ),
    setAside: (ids): boolean =>
      asides() &&
      write(
        listed.map(
          (note): KeptSceneNote =>
            ids.includes(note.id) ? { ...note, standing: "set-aside" } : note
        )
      ),
  }
}

function phone(
  listed: Array<KeptSceneNote> = [],
  {
    stores = true,
    removes,
    asides,
    kept = (): TakeKept => ({ place: "phone" }),
  }: {
    stores?: boolean
    /** Whether the list stores a note let go; it does unless said. */
    removes?: () => boolean
    /** Whether the list stores a note set aside; it does unless said. */
    asides?: () => boolean
    kept?: (id: string) => TakeKept
  } = {}
): {
  voice: PhoneSceneVoice
  audio: ReturnType<typeof memoryShelf>
  listed: Array<KeptSceneNote>
} {
  const mic = simulatedMicrophone({ now: Date.now })
  const audio = memoryShelf()
  let next = 0
  const voice = createSceneVoice({
    startRecording: mic.startRecording,
    owner: microphoneOwner(),
    player: simulatedPlayer(),
    audio,
    notes: memoryNotes(listed, stores, removes, asides),
    saving: () => undefined,
    now: Date.now,
    newId: () => `n${(next += 1)}`,
    kept,
  })
  return { voice, audio, listed }
}

const pass = async (ms = 0): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms)
}

/** One take of `ms`, tapped on and off, as the scene's button does. */
async function talk(
  voice: ReturnType<typeof createSceneVoice>,
  ms = 4_000,
  supersedes: string | null = null
): Promise<void> {
  voice.pattern.tap(NEXT_SCENE, supersedes)
  await pass(ms)
  voice.pattern.tap(NEXT_SCENE)
  await pass()
}

const ids = (voice: ReturnType<typeof createSceneVoice>): Array<string> =>
  voice.getSnapshot().notes.map(({ id }) => id)

const note = (
  id: string,
  extra: Partial<KeptSceneNote> = {}
): KeptSceneNote => ({
  id,
  durationMs: 1_000,
  mimeType: "audio/webm",
  ...extra,
})

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("createSceneVoice", () => {
  it("keeps each take as a note in the draft: its audio, then its entry, with when", async () => {
    const { voice, audio, listed } = phone()
    await talk(voice)
    await talk(voice)
    expect(await audio.ids()).toEqual(["n1", "n2"])
    expect(ids(voice)).toEqual(["n1", "n2"])
    expect(voice.getSnapshot()).toMatchObject({ taking: false, full: false })
    expect(voice.pattern.getSnapshot().ended?.ending).toBe("kept")
    // When it was kept, for home (LA13).
    expect(listed[0]?.at).toMatch(/^\d{4}-\d\d-\d\dT/)
  })

  it("sets a note aside, kept with its audio, and out of what an ask names (D3)", async () => {
    const { voice, audio, listed } = phone()
    await talk(voice)
    await talk(voice)
    voice.pattern.letGo("n1", "phone")
    expect(ids(voice)).toEqual(["n2"])
    expect(listed.map(({ id, standing }) => [id, standing])).toEqual([
      ["n1", "set-aside"],
      ["n2", undefined],
    ])
    expect(await audio.ids()).toEqual(["n1", "n2"])
  })

  it("takes back the set-aside line when the phone won't store the note set aside", async () => {
    const { voice, listed } = phone([], { asides: () => false })
    await talk(voice)
    voice.pattern.letGo("n1", "phone")
    expect(voice.pattern.getSnapshot().setAside).toBeNull()
    expect(ids(voice)).toEqual(["n1"])
    expect(listed[0]?.standing).toBeUndefined()
  })

  it("lets the whole scene go by setting every note in the draft aside, kept", async () => {
    const { voice, audio, listed } = phone()
    await talk(voice)
    await talk(voice)
    voice.letGoScene()
    expect(ids(voice)).toEqual([])
    expect(listed.map(({ standing }) => standing)).toEqual([
      "set-aside",
      "set-aside",
    ])
    expect(await audio.ids()).toEqual(["n1", "n2"])
  })

  it("keeps the note a Redo records again, out of the draft, beside the new one (D2)", async () => {
    const { voice, listed } = phone()
    await talk(voice)
    await talk(voice, 4_000, "n1")
    expect(ids(voice)).toEqual(["n2"])
    expect(listed.map(({ id, standing }) => [id, standing])).toEqual([
      ["n1", "earlier"],
      ["n2", undefined],
    ])
  })

  it("lets go from the phone only notes home holds that a held ask carried or that are out of the draft (LG1)", async () => {
    const { voice, audio } = phone()
    await talk(voice)
    await talk(voice)
    await talk(voice)
    await talk(voice)
    voice.pattern.letGo("n4", "home")
    // Home holds a note as soon as it is kept: the draft keeps it until a
    // prompt carried it (HF2), or it is out of the draft.
    voice.letGo(new Set(["n1", "n2", "never-heard"]))
    expect(await audio.ids()).toEqual(["n1", "n2", "n3", "n4"])
    voice.prompted(["n2", "n3"])
    voice.letGo(new Set(["n1", "n2", "n4", "never-heard"]))
    await pass()
    expect(await audio.ids()).toEqual(["n1", "n3"])
    expect(ids(voice)).toEqual(["n1", "n3"])
  })

  it("says where each note is kept, from the voice lane (MIC3)", async () => {
    const { voice } = phone([], {
      kept: (id) =>
        id === "n1" ? { place: "home", since: null } : { place: "going" },
    })
    await talk(voice)
    await talk(voice)
    expect(
      voice.getSnapshot().takes.map(({ id, kept }) => [id, kept.place])
    ).toEqual([
      ["n1", "home"],
      ["n2", "going"],
    ])
  })

  it("caps the draft at five, and lets notes out of it count only toward the phone's twenty", async () => {
    const { voice } = phone()
    await talk(voice)
    await talk(voice)
    await talk(voice)
    // Three notes and two Redos: the draft still has room for two more.
    await talk(voice, 4_000, "n3")
    await talk(voice, 4_000, "n4")
    expect(ids(voice)).toEqual(["n1", "n2", "n5"])
    expect(voice.getSnapshot().full).toBe(false)
    await talk(voice)
    await talk(voice)
    expect(ids(voice)).toHaveLength(SCENE_NOTES_MAX)
    // A new scene starts with room, the old notes set aside and kept.
    voice.letGoScene()
    await talk(voice)
    expect(ids(voice)).toEqual(["n8"])
  })

  it("at the phone's twenty, makes room with the oldest home holds out of the draft, and refuses while there is none", async () => {
    const aside = Array.from({ length: SCENE_NOTES_KEPT - 1 }, (_, index) =>
      note(`aside-${index}`, {
        standing: "set-aside",
        at: new Date(index * 1_000).toISOString(),
      })
    )
    const home = new Set<string>()
    const { voice, listed } = phone([note("draft"), ...aside], {
      kept: (id) =>
        home.has(id) ? { place: "home", since: null } : { place: "going" },
    })
    expect(voice.getSnapshot()).toMatchObject({ full: true })
    await talk(voice)
    expect(voice.pattern.getSnapshot().ended?.ending).toBe("full")
    expect(listed).toHaveLength(SCENE_NOTES_KEPT)
    // Home holds two set aside, and the draft's own note: only one out of
    // the draft makes room, the oldest.
    home.add("aside-3").add("aside-1").add("draft")
    voice.recount()
    expect(voice.getSnapshot().full).toBe(false)
    await talk(voice)
    expect(voice.pattern.getSnapshot().ended?.ending).toBe("kept")
    expect(listed.map(({ id }) => id)).not.toContain("aside-1")
    expect(listed.map(({ id }) => id)).toContain("aside-3")
    expect(listed).toHaveLength(SCENE_NOTES_KEPT)
    expect(ids(voice)).toEqual(["draft", "n1"])
  })

  it("keeps nothing when the room it makes at twenty is not stored, dropping none home lacks (RM1)", async () => {
    const aside = Array.from({ length: SCENE_NOTES_KEPT - 1 }, (_, index) =>
      note(`aside-${index}`, {
        standing: "set-aside",
        at: new Date(index * 1_000).toISOString(),
      })
    )
    const { voice, listed, audio } = phone([note("draft"), ...aside], {
      removes: () => false,
      kept: (id) =>
        id === "aside-0" ? { place: "home", since: null } : { place: "going" },
    })
    expect(voice.getSnapshot().full).toBe(false)
    await talk(voice)
    expect(voice.pattern.getSnapshot().ended?.ending).toBe("failed")
    expect(listed).toHaveLength(SCENE_NOTES_KEPT)
    expect(listed.map(({ id }) => id)).toContain("aside-0")
    expect(await audio.ids()).toEqual([])
  })

  it("takes the audio back out when its entry cannot be listed", async () => {
    const { voice, audio } = phone([], { stores: false })
    await talk(voice)
    expect(await audio.ids()).toEqual([])
    expect(voice.pattern.getSnapshot().ended?.ending).toBe("failed")
  })
})

describe("sweepNotes (SV1)", () => {
  it("lets go a note whose audio never landed, and audio no note names", async () => {
    const listed = [note("silent"), note("kept")]
    const audio = memoryShelf()
    await audio.put("kept", new Blob(["v"]))
    await audio.put("stray", new Blob(["v"]))
    const remove = vi.fn()
    await sweepNotes({
      notes: memoryNotes(listed),
      audio,
      isSaving: () => false,
      remove,
    })
    expect(remove).toHaveBeenCalledWith(["silent"])
    expect(await audio.ids()).toEqual(["kept"])
  })

  it("never counts silent a note that lands while the shelf's ids are read", async () => {
    const listed: Array<KeptSceneNote> = []
    const audio = memoryShelf()
    const ids = audio.ids
    // The note's audio, then its entry, land while the ids are being read.
    audio.ids = async (): Promise<Array<string>> => {
      const before = await ids()
      await audio.put("late", new Blob(["v"]))
      listed.push(note("late"))
      return before
    }
    const remove = vi.fn()
    await sweepNotes({
      notes: memoryNotes(listed),
      audio,
      isSaving: () => false,
      remove,
    })
    expect(remove).not.toHaveBeenCalled()
    expect(await ids()).toEqual(["late"])
  })
})
