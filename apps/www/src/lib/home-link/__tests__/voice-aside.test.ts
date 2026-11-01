/**
 * @vitest-environment jsdom
 *
 * MIC2 (D3 on epic #2368): a voice note the owner let go on the phone gets
 * home's set-aside mark once home holds it, through one path over every
 * store that goes home (`../voice-copy`'s candidates), whatever store keeps
 * it. Home's 404 leaves the mark owed for the next run, a run after the mark
 * was taken sends nothing, a Redo's earlier take owes none, and a soundbite
 * home already holds that is then set aside gets its mark too (Codex on
 * #2441).
 */
import type { HomeCall } from "@some-ui/core-utils"
import type { Soundbite } from "@some-ui/soundbites"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import type { BlobShelf } from "@some-ui/voice-capture"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { readSent, rememberSent } from "@/lib/home-link/sent"
import { setAsidePath } from "@/lib/home-link/set-aside"
import { asideAt, sendVoice, watchVoiceNotes } from "@/lib/home-link/voice-copy"
import type { JobsState, VoiceNote } from "@/lib/jobs/model"
import { EMPTY } from "@/lib/jobs/model"
import type { KeptSceneNote } from "@/lib/scene-voice"
import type { Reflection } from "@/lib/session-reflection/policy"
import type { Take } from "@/lib/takes-desk"
import { ASIDE_UNFOUND_MAX } from "@/lib/voice-home/model"
import type { VoiceHome } from "@/lib/voice-home/runtime"
import { createVoiceHome } from "@/lib/voice-home/runtime"

/**
 * A note's audio, a takes desk over `takes`, as the voice lane reads them,
 * and what the lane last told each store may leave the phone: the lens
 * desk's safe marks, and the soundbites' held reading.
 */
const { AUDIO, desk, told } = vi.hoisted(() => {
  const audio = (): Promise<Blob | null> => Promise.resolve(new Blob(["a"]))
  const told: {
    lens: ((id: string) => boolean) | null
    bites: ((id: string, standing?: string) => boolean) | null
  } = { lens: null, bites: null }
  return {
    AUDIO: audio,
    told,
    desk: (takes: () => ReadonlyArray<unknown>, name?: "lens"): unknown => ({
      kept: takes,
      audio,
      keptWhere: (_where: unknown, marked: (id: string) => boolean): void => {
        if (name !== undefined) told[name] = marked
      },
      phone: () => ({
        subscribe: () => (): void => undefined,
        takes: { subscribe: () => (): void => undefined },
      }),
    }),
  }
})

/** What each store keeps, as the test sets it. */
const fakes = vi.hoisted(
  (): {
    home: VoiceHome | null
    reflections: Array<Reflection>
    jobs: JobsState | null
    bites: Array<Soundbite>
    lens: Array<Take>
    leetype: Array<Take>
    scene: Array<KeptSceneNote>
    paired: boolean
  } => ({
    home: null,
    reflections: [],
    jobs: null,
    bites: [],
    lens: [],
    leetype: [],
    scene: [],
    paired: true,
  })
)

vi.mock("@/lib/session-reflection", () => ({
  reflections: {
    getSnapshot: (): unknown => ({ kept: fakes.reflections }),
    subscribe: () => (): void => undefined,
  },
}))
vi.mock("@/lib/reflection-voice", () => ({
  isSaving: (): boolean => false,
  onAudioSettled: () => (): void => undefined,
  reflectionAudio: (): unknown => ({ get: AUDIO }),
  reflectionNotesKept: (): void => undefined,
}))
vi.mock("@/lib/jobs", () => ({
  phoneJobs: (): unknown => ({
    getSnapshot: () => ({ state: fakes.jobs }),
    subscribe: () => (): void => undefined,
    letGo: (): void => undefined,
  }),
  jobVoiceAudio: (): unknown => ({ get: AUDIO }),
}))
vi.mock("@/lib/soundbite-keeping", () => ({
  soundbiteKeeping: (): unknown => ({
    store: {
      list: (): Promise<Array<Soundbite>> => Promise.resolve(fakes.bites),
      audio: AUDIO,
      subscribe: () => (): void => undefined,
    },
    heldByHome: (
      next: () => (id: string, standing?: string) => boolean
    ): void => {
      told.bites = next()
    },
  }),
  onSoundbitesKept: () => (): void => undefined,
}))
vi.mock("@/lib/studio-keeping", () => ({
  studioKeeping: (): null => null,
  onStudioKept: () => (): void => undefined,
}))
vi.mock("@/lib/lens-takes", () => ({
  lensTakesDesk: desk(() => fakes.lens, "lens"),
}))
vi.mock("@/lib/leetype-takes", () => ({
  leetypeTakesDesk: desk(() => fakes.leetype),
  leetypeNotesHeldByHome: (): void => undefined,
}))
vi.mock("@/lib/idea-takes", () => ({ ideaTakesDesk: desk(() => []) }))
vi.mock("@/lib/game-bites", () => ({
  phoneGameBites: (): unknown => ({
    ready: (): Array<never> => [],
    audio: AUDIO,
    subscribe: () => (): void => undefined,
    letGo: (): void => undefined,
  }),
}))
vi.mock("@/lib/scene-voice", () => ({
  phoneSceneVoice: (): unknown => ({
    subscribe: () => (): void => undefined,
    // As the draft does: a note home holds leaves once out of the draft.
    letGo: (holds: ReadonlySet<string>): void => {
      fakes.scene = fakes.scene.filter(
        (note) => !(holds.has(note.id) && note.standing !== undefined)
      )
    },
  }),
  sceneNotes: { read: (): Array<KeptSceneNote> => fakes.scene, audio: AUDIO },
  sceneNotesKept: (): void => undefined,
}))
vi.mock("@some-ui/topik", () => ({
  lensRecordHeldByHome: (): void => undefined,
}))
vi.mock("@/lib/voice-home", () => ({
  phoneVoiceHome: (): VoiceHome | null => fakes.home,
}))
vi.mock("@/lib/home-link", () => ({
  homeLink: (): unknown => ({ subscribe: () => (): void => undefined }),
  paired: (): boolean => fakes.paired,
  pairingOf: (): string => "pairing-1",
}))
vi.mock("@some-ui/intent-kit", async (actual) => ({
  ...(await actual<object>()),
  reportFailure: vi.fn(),
}))

/** When the owner let a note go, as its store recorded it. */
const LET_GO = "2026-11-01T09:15:00.000Z"
const LET_GO_MS = Date.parse(LET_GO)

function shelf(): BlobShelf {
  const held = new Map<string, Blob>()
  return {
    put: (id, blob): Promise<void> => {
      held.set(id, blob)
      return Promise.resolve()
    },
    get: (id) => Promise.resolve(held.get(id) ?? null),
    remove: (ids): Promise<void> => {
      for (const id of ids) held.delete(id)
      return Promise.resolve()
    },
    ids: () => Promise.resolve([...held.keys()]),
  }
}

/**
 * Home: holds each note it is sent, and answers each mark with
 * `marks(id)`; every request it hears is kept in `heard`.
 */
function home(
  heard: Array<string>,
  marks: (id: string) => number = () => 204
): HomeCall {
  return (_method, path) => {
    heard.push(path)
    const id = decodeURIComponent(path.split("/")[2]?.split("?")[0] ?? "")
    if (path.includes("/set-aside?")) {
      return Promise.resolve({ status: marks(id), body: "" })
    }
    return Promise.resolve({
      status: 200,
      body: JSON.stringify({ note: { id, sha256: "s" } }),
    })
  }
}

const marksIn = (heard: ReadonlyArray<string>): Array<string> =>
  heard.filter((path) => path.includes("/set-aside?"))

const take = (id: string, standing?: Take["standing"]): Take => ({
  id,
  line: "line-1",
  takenAt: Date.parse("2026-11-01T08:00:00.000Z"),
  durationMs: 2000,
  mimeType: "audio/webm",
  ...(standing === undefined ? {} : { standing }),
  ...(standing === "set-aside" ? { setAsideAt: LET_GO_MS } : {}),
})

const bite = (id: string, standing?: Soundbite["standing"]): Soundbite => ({
  id,
  recordedAt: "2026-11-01T08:00:00.000Z",
  durationMs: 5000,
  mimeType: "audio/webm",
  bytes: 4,
  context: {
    source: "reminder",
    lastSessionAt: null,
    openSessions: 0,
    timeZone: "UTC",
  },
  ...(standing === undefined ? {} : { standing }),
  ...(standing === "set-aside" ? { setAsideAt: LET_GO } : {}),
})

const reflection = (
  id: string,
  standing?: "earlier" | "set-aside"
): Reflection => ({
  id,
  sessionId: "session-1",
  createdAt: "2026-11-01T08:00:00.000Z",
  atMs: null,
  body: {
    kind: "voice",
    durationMs: 3000,
    mimeType: "audio/webm",
    bytes: 4,
    ...(standing === undefined ? {} : { standing }),
    ...(standing === "set-aside" ? { setAsideAt: LET_GO } : {}),
  },
})

/** A Jobs form's note out of its draft, filed home with the form's event. */
function jobs(id: string, standing?: "earlier" | "set-aside"): JobsState {
  const note: VoiceNote = {
    id,
    mimeType: "audio/webm",
    durationMs: 2000,
    owner: "form",
    filed: { ref: "2026-11-01:acme", at: "2026-11-01T08:30:00.000Z" },
    ...(standing === undefined ? {} : { standing }),
    ...(standing === "set-aside" ? { setAsideAt: LET_GO } : {}),
  }
  return { ...EMPTY, voice: [note] }
}

const sceneNote = (
  id: string,
  standing?: "earlier" | "set-aside"
): KeptSceneNote => ({
  id,
  durationMs: 4000,
  mimeType: "audio/mp4",
  at: "2026-11-01T08:00:00.000Z",
  ...(standing === undefined ? {} : { standing }),
  ...(standing === "set-aside" ? { setAsideAt: LET_GO } : {}),
})

/** Each store that goes home and lets a take be set aside, keeping `id` as `standing`. */
const STORES: ReadonlyArray<
  readonly [string, (id: string, standing?: "earlier" | "set-aside") => void]
> = [
  [
    "a spoken reflection",
    (id, standing): void => {
      fakes.reflections = [reflection(id, standing)]
    },
  ],
  [
    "a Jobs note",
    (id, standing): void => {
      fakes.jobs = jobs(id, standing)
    },
  ],
  [
    "a soundbite",
    (id, standing): void => {
      fakes.bites = [bite(id, standing)]
    },
  ],
  [
    "a grammar-lens take",
    (id, standing): void => {
      fakes.lens = [take(id, standing)]
    },
  ],
  [
    "a LeetType take",
    (id, standing): void => {
      fakes.leetype = [take(id, standing)]
    },
  ],
  [
    "a scene note",
    (id, standing): void => {
      fakes.scene = [sceneNote(id, standing)]
    },
  ],
]

beforeEach(() => {
  fakes.home = createVoiceHome({
    storage: memoryStorage(),
    shelf: shelf(),
    encode: () => Promise.resolve({ base64: "", sha256: "s" }),
    now: () => Date.parse("2026-11-01T10:00:00.000Z"),
  })
  fakes.reflections = []
  fakes.jobs = EMPTY
  fakes.bites = []
  fakes.lens = []
  fakes.leetype = []
  fakes.scene = []
  fakes.paired = true
})

describe("home's set-aside mark on a note let go on the phone (MIC2)", () => {
  it.each(STORES)(
    "marks %s set aside once home holds it, with when it was let go, and once only",
    async (_kind, keep) => {
      keep("n1", "set-aside")
      const heard: Array<string> = []
      expect(await sendVoice(home(heard))).toEqual({ kind: "synced" })
      // The note went first, then its mark, in the same run.
      expect(heard.at(-2)).toMatch(/^\/voice-notes\/n1\?/)
      expect(marksIn(heard)).toEqual([setAsidePath({ id: "n1", at: LET_GO })])

      const again: Array<string> = []
      expect(await sendVoice(home(again))).toEqual({ kind: "synced" })
      expect(again).toEqual([])
    }
  )

  it.each(STORES)(
    "sends no mark for %s a Redo recorded again, nor one in view",
    async (_kind, keep) => {
      keep("n1", "earlier")
      const heard: Array<string> = []
      expect(await sendVoice(home(heard))).toEqual({ kind: "synced" })
      expect(fakes.home?.getSnapshot().held).toEqual(["n1"])
      keep("n1")
      expect(await sendVoice(home(heard))).toEqual({ kind: "synced" })
      expect(marksIn(heard)).toEqual([])
    }
  )

  it("keeps a mark home found no note for owed, and sends it on a later run", async () => {
    fakes.lens = [take("n1", "set-aside")]
    const first: Array<string> = []
    expect(await sendVoice(home(first, () => 404))).toEqual({ kind: "synced" })
    expect(marksIn(first)).toHaveLength(1)
    expect(fakes.home?.getSnapshot().aside.owed).toEqual([
      { id: "n1", at: LET_GO, unfound: 1 },
    ])

    const second: Array<string> = []
    expect(await sendVoice(home(second))).toEqual({ kind: "synced" })
    expect(marksIn(second)).toEqual([setAsidePath({ id: "n1", at: LET_GO })])
    const third: Array<string> = []
    await sendVoice(home(third))
    expect(marksIn(third)).toEqual([])
  })

  it("gives a mark up once home has found no such note on ASIDE_UNFOUND_MAX runs, keeping it as given up and asking no more", async () => {
    fakes.bites = [bite("n1", "set-aside")]
    for (let run = 0; run < ASIDE_UNFOUND_MAX; run += 1) {
      const heard: Array<string> = []
      expect(await sendVoice(home(heard, () => 404))).toEqual({
        kind: "synced",
      })
      expect(marksIn(heard)).toHaveLength(1)
    }
    expect(fakes.home?.getSnapshot().aside).toMatchObject({
      owed: [],
      givenUp: [{ id: "n1", why: "unfound" }],
    })
    const after: Array<string> = []
    await sendVoice(home(after, () => 404))
    expect(marksIn(after)).toEqual([])
  })

  it("keeps a mark owed when its request got no answer, and the run throws as the lane's other requests do", async () => {
    fakes.bites = [bite("n1", "set-aside")]
    const lost: HomeCall = (method, path, body) =>
      path.includes("/set-aside?")
        ? Promise.reject(new Error("no answer"))
        : home([])(method, path, body)
    await expect(sendVoice(lost)).rejects.toThrow("no answer")
    expect(fakes.home?.getSnapshot().aside.owed).toEqual([
      { id: "n1", at: LET_GO },
    ])
  })

  it("marks a soundbite home already held once it is set aside (Codex on #2441)", async () => {
    fakes.bites = [bite("b1")]
    const sent: Array<string> = []
    expect(await sendVoice(home(sent))).toEqual({ kind: "synced" })
    expect(fakes.home?.getSnapshot().held).toEqual(["b1"])
    expect(marksIn(sent)).toEqual([])

    fakes.bites = [bite("b1", "set-aside")]
    const later: Array<string> = []
    expect(await sendVoice(home(later))).toEqual({ kind: "synced" })
    // Nothing to copy again: only the mark goes.
    expect(later).toEqual([setAsidePath({ id: "b1", at: LET_GO })])
  })

  it("keeps the mark of a note that leaves the phone on home's word, set aside after home held it", async () => {
    fakes.scene = [sceneNote("s1")]
    await sendVoice(home([]))
    expect(fakes.home?.getSnapshot().held).toEqual(["s1"])
    // Let go once home held it: the draft lets it go on home's word, at
    // once, before any run could send its mark.
    fakes.scene = [sceneNote("s1", "set-aside")]
    watchVoiceNotes()()
    expect(fakes.scene).toEqual([])

    const heard: Array<string> = []
    expect(await sendVoice(home(heard))).toEqual({ kind: "synced" })
    expect(heard).toEqual([setAsidePath({ id: "s1", at: LET_GO })])
  })

  it("keeps a scene note set aside on the phone while storage won't keep its mark, and lets it go once it does (LA13)", async () => {
    const storage = memoryStorage()
    let full = false
    const tight = {
      ...storage,
      setItem: (key: string, value: string): void => {
        if (full) throw new DOMException("full", "QuotaExceededError")
        storage.setItem(key, value)
      },
    }
    fakes.home = createVoiceHome({
      storage: tight,
      shelf: shelf(),
      encode: () => Promise.resolve({ base64: "", sha256: "s" }),
      now: Date.now,
    })
    fakes.scene = [sceneNote("s1")]
    await sendVoice(home([]))
    expect(fakes.home.getSnapshot().held).toEqual(["s1"])

    full = true
    fakes.scene = [sceneNote("s1", "set-aside")]
    watchVoiceNotes()()
    // Owed in memory only: the note stays, so a later launch owes it again.
    expect(fakes.home.getSnapshot().aside.owed).toHaveLength(1)
    expect(fakes.home.markSafe("s1")).toBe(false)
    expect(fakes.scene).toHaveLength(1)

    full = false
    watchVoiceNotes()()
    expect(fakes.home.markSafe("s1")).toBe(true)
    expect(fakes.scene).toEqual([])
  })

  it("owes the mark of a held take set aside on a phone no longer paired, and only then lets its store make room with it (LA13)", async () => {
    const storage = memoryStorage()
    let full = false
    fakes.home = createVoiceHome({
      storage: {
        ...storage,
        setItem: (key: string, value: string): void => {
          if (full) throw new DOMException("full", "QuotaExceededError")
          storage.setItem(key, value)
        },
      },
      shelf: shelf(),
      encode: () => Promise.resolve({ base64: "", sha256: "s" }),
      now: Date.now,
    })
    fakes.lens = [take("n1")]
    fakes.bites = [bite("b1")]
    await sendVoice(home([]))
    expect(fakes.home.getSnapshot().held).toEqual(["b1", "n1"])
    // Practice's run left b1's record on home too.
    rememberSent(localStorage, readSent(localStorage, "pairing-1"), {
      notes: { "soundbite:b1": "sha" },
    })

    // Away from home, both let go while storage won't keep a mark.
    fakes.paired = false
    fakes.lens = [take("n1", "set-aside")]
    fakes.bites = [bite("b1", "set-aside")]
    full = true
    watchVoiceNotes()()
    expect(told.lens?.("n1")).toBe(false)
    expect(told.bites?.("b1", "set-aside")).toBe(false)
    // Held all the same, as its row says.
    expect(told.bites?.("b1")).toBe(true)

    full = false
    watchVoiceNotes()()
    expect(told.lens?.("n1")).toBe(true)
    // The soundbites are read only on a paired pass: until then the one set
    // aside makes no room.
    expect(told.bites?.("b1", "set-aside")).toBe(false)
    fakes.paired = true
    const heard: Array<string> = []
    await sendVoice(home(heard))
    watchVoiceNotes()()
    expect(told.bites?.("b1", "set-aside")).toBe(true)
    expect(marksIn(heard)).toHaveLength(2)
  })

  it("reads when a note was set aside off any record, a time it can't read as none", () => {
    expect(asideAt({ standing: "set-aside", setAsideAt: LET_GO })).toBe(LET_GO)
    expect(asideAt({ standing: "set-aside", setAsideAt: LET_GO_MS })).toBe(
      LET_GO
    )
    for (const setAsideAt of ["soon", "", Number.NaN, Infinity, {}]) {
      expect(asideAt({ standing: "set-aside", setAsideAt })).toBeNull()
    }
    expect(asideAt({ standing: "set-aside" })).toBeNull()
    expect(asideAt({ standing: "earlier", setAsideAt: LET_GO })).toBeUndefined()
    // A record with no standing at all, a game bite's say.
    expect(asideAt({ id: "g1" })).toBeUndefined()
    expect(asideAt(undefined)).toBeUndefined()
  })

  it("marks a Jobs note whose stored time is no time as of now, and copies and lets go as ever", async () => {
    fakes.jobs = {
      ...EMPTY,
      voice: jobs("n1", "set-aside").voice.map((note) => ({
        ...note,
        setAsideAt: "soon",
      })),
    }
    vi.useFakeTimers({ now: Date.parse("2026-11-01T11:00:00.000Z") })
    try {
      const heard: Array<string> = []
      expect(await sendVoice(home(heard))).toEqual({ kind: "synced" })
      expect(marksIn(heard)).toEqual([
        setAsidePath({ id: "n1", at: "2026-11-01T11:00:00.000Z" }),
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it("marks a take set aside before its store noted when as of when this phone first saw it", async () => {
    const { setAsideAt: _, ...untimed } = take("n1", "set-aside")
    fakes.leetype = [untimed]
    vi.useFakeTimers({ now: Date.parse("2026-11-01T11:00:00.000Z") })
    try {
      const heard: Array<string> = []
      await sendVoice(home(heard, () => 404))
      vi.setSystemTime(Date.parse("2026-11-02T11:00:00.000Z"))
      const later: Array<string> = []
      await sendVoice(home(later))
      expect(marksIn(later)).toEqual([
        setAsidePath({ id: "n1", at: "2026-11-01T11:00:00.000Z" }),
      ])
    } finally {
      vi.useRealTimers()
    }
  })
})
