/**
 * @vitest-environment jsdom
 *
 * The voice lane's run end to end over fake stores (LA14): a copy pass, then
 * the exchange. A note whose audio is gone fails no run and stops counting
 * as waiting; one with no room fails the run as the phone's lack of room,
 * still waits, and goes once there is room; one the phone fails to copy,
 * or whose record storage won't keep, fails the run as the phone's fault;
 * a Jobs note let go once its share arrived is never offered; and a store
 * that can't be listed holds back none of the others.
 */
import type { HomeCall } from "@some-ui/core-utils"
import { reportFailure } from "@some-ui/intent-kit"
import type { Soundbite } from "@some-ui/soundbites"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import type { BlobShelf } from "@some-ui/voice-capture"
import { ShelfFullError } from "@some-ui/voice-capture"
import { renderHook } from "@testing-library/react"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { useUnsendable, voiceLane } from "@/lib/home-link/voice"
import { sendVoice, storesRead } from "@/lib/home-link/voice-copy"
import type { JobEvent, JobsState } from "@/lib/jobs/model"
import { EMPTY } from "@/lib/jobs/model"
import { keepSoundbites } from "@/lib/soundbite-keeping"
import { keepStudio } from "@/lib/studio-keeping"
import type { VoiceHome } from "@/lib/voice-home/runtime"
import { createVoiceHome } from "@/lib/voice-home/runtime"

const fakes = vi.hoisted(
  (): {
    jobs: { state: JobsState } | null
    audio: Map<string, Blob | Error>
    home: VoiceHome | null
    scene: Array<{
      id: string
      durationMs: number
      mimeType: string
      at: string
    }>
  } => ({ jobs: null, audio: new Map(), home: null, scene: [] })
)

vi.mock("@/lib/jobs", () => ({
  phoneJobs: (): unknown => ({
    getSnapshot: () => fakes.jobs,
    subscribe: () => (): void => undefined,
  }),
  jobVoiceAudio: (): unknown => ({
    get: (id: string): Promise<Blob | null> => {
      const audio = fakes.audio.get(id)
      return audio instanceof Error
        ? Promise.reject(audio)
        : Promise.resolve(audio ?? null)
    },
  }),
}))
vi.mock("@/lib/session-reflection", () => {
  const snapshot = { kept: [] }
  return {
    reflections: {
      getSnapshot: (): typeof snapshot => snapshot,
      subscribe: () => (): void => undefined,
    },
  }
})
vi.mock("@/lib/reflection-voice", () => ({
  isSaving: (): boolean => false,
  onAudioSettled: () => (): void => undefined,
  reflectionAudio: (): unknown => ({ get: () => Promise.resolve(null) }),
}))
vi.mock("@/lib/scene-voice", () => ({
  phoneSceneVoice: (): unknown => ({
    subscribe: () => (): void => undefined,
    letGo: (): void => undefined,
  }),
  sceneNotes: {
    read: (): unknown => fakes.scene,
    audio: (id: string): Promise<Blob | null> =>
      Promise.resolve(id === "s1" ? new Blob(["s"]) : null),
  },
}))
vi.mock("@/lib/voice-home", () => ({
  phoneVoiceHome: (): VoiceHome | null => fakes.home,
}))
vi.mock("@/lib/home-link/lanes", () => ({
  useLaneHome: (): unknown => null,
}))
vi.mock("@/lib/home-link", () => ({
  homeLink: vi.fn(),
  paired: (): boolean => true,
}))
vi.mock("@some-ui/intent-kit", async (actual) => ({
  ...(await actual<object>()),
  reportFailure: vi.fn(),
}))

/** A shelf with room for `room` copies. */
function shelf(room: number): BlobShelf {
  const held = new Map<string, Blob>()
  return {
    put: (id, blob): Promise<void> => {
      if (held.size >= room) return Promise.reject(new ShelfFullError())
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
 * A Jobs record naming `ids`, each with its audio on this phone or not;
 * `arrived`, with a decisions share of them that arrived in Drive, so the
 * record let their audio go.
 */
function record(
  ids: ReadonlyArray<string>,
  arrived = false
): { state: JobsState } {
  const passed: JobEvent = {
    id: "e1",
    at: "2026-10-25T08:00:00.000Z",
    type: "passed",
    reasons: [],
    note: "",
    voice: ids,
    day: "2026-10-25",
    pickId: "acme-sre",
    fingerprint: "f",
  }
  const shared: ReadonlyArray<JobEvent> = [
    {
      id: "e2",
      at: "2026-10-25T09:00:00.000Z",
      type: "shared",
      kind: "decisions",
      day: "2026-10-25",
      file: "decisions-2026-10-25.json",
      through: 1,
      voice: ids,
    },
    {
      id: "e3",
      at: "2026-10-25T10:00:00.000Z",
      type: "arrived",
      shareId: "e2",
    },
  ]
  return {
    state: {
      ...EMPTY,
      log: arrived ? [passed, ...shared] : [passed],
      voice: ids.map((id) => ({
        id,
        mimeType: "audio/webm",
        durationMs: 1000,
        owner: "e1",
      })),
    },
  }
}

/** Home, holding each note it is sent. */
const send: HomeCall = (_method, path) => {
  const id = decodeURIComponent(path.split("/")[2]?.split("?")[0] ?? "")
  return Promise.resolve({
    status: 200,
    body: JSON.stringify({ note: { id, sha256: "s" } }),
  })
}

function setUp(
  room: number,
  audio: Record<string, Blob | Error | null>,
  { arrived = false, storage = memoryStorage() } = {}
): void {
  fakes.jobs = record(Object.keys(audio), arrived)
  fakes.scene = []
  fakes.audio = new Map(
    Object.entries(audio).flatMap(([id, a]) => (a === null ? [] : [[id, a]]))
  )
  fakes.home = createVoiceHome({
    storage,
    shelf: shelf(room),
    encode: () => Promise.resolve({ base64: "", sha256: "s" }),
  })
}

const waiting = (): number =>
  renderHook(() => voiceLane.useCounts()).result.current.waiting

describe("the voice lane's run, after its copy pass (LA14)", () => {
  it("fails for no room, counts no note whose audio is gone, and sends the rest once there is room", async () => {
    setUp(1, { v1: new Blob(["a"]), gone: null, v3: new Blob(["c"]) })
    expect(await sendVoice(send)).toEqual({ kind: "failed", why: "room" })
    expect(fakes.home?.getSnapshot().held).toEqual(["v1"])
    // v3 had no room and waits; the note with no audio does not.
    expect(waiting()).toBe(1)

    await Promise.resolve()
    expect(await sendVoice(send)).toEqual({ kind: "synced" })
    expect(fakes.home?.getSnapshot().held).toEqual(["v1", "v3"])
    expect(waiting()).toBe(0)
  })

  it("fails as the phone's fault when a note's audio can't be read, and goes on to the next", async () => {
    setUp(5, { broken: new Error("read failed"), v2: new Blob(["b"]) })
    expect(await sendVoice(send)).toEqual({ kind: "failed", why: "fault" })
    expect(fakes.home?.getSnapshot().held).toEqual(["v2"])
    expect(waiting()).toBe(1)
  })

  it("fails as the phone's fault when storage won't keep a copy's record, and the note still waits", async () => {
    const storage = {
      ...memoryStorage(),
      setItem: (): void => {
        throw new Error("quota")
      },
    }
    setUp(5, { v1: new Blob(["a"]) }, { storage })
    expect(await sendVoice(send)).toEqual({ kind: "failed", why: "fault" })
    expect(waiting()).toBe(1)
  })

  it("offers a Jobs note whose share arrived like any other, and names it gone when its audio is (LG1)", async () => {
    setUp(5, { r1: null, r2: null }, { arrived: true })
    expect(await sendVoice(send)).toEqual({ kind: "synced" })
    expect(waiting()).toBe(0)
    expect(renderHook(() => useUnsendable()).result.current).toEqual({
      gone: 2,
    })
  })
})

describe("Studio's takes, once its route hands them in (ST12)", () => {
  it("are counted waiting once read, copied for home as studio notes, and not counted once held", async () => {
    setUp(5, {})
    expect(waiting()).toBe(0)
    const take = new Blob(["take"])
    keepStudio({
      store: {
        list: () => Promise.resolve([]),
        audio: (project: string, id: string) =>
          Promise.resolve(project === "p1" && id === "t1" ? take : null),
        friction: () => Promise.resolve([]),
        subscribe: () => (): void => undefined,
      },
      timeLog: () => [],
      notesForHome: () => [
        {
          id: "t1",
          ref: "p1:s1:t1",
          at: "2026-10-29T08:00:00.000Z",
          contentType: "audio/webm",
          project: "p1",
        },
      ],
      letGoHeldTakes: () => Promise.resolve(0),
      sittingKey: () => "s",
    })
    const sent: Array<string> = []
    const recording: HomeCall = (method, path, init) => {
      sent.push(path)
      return send(method, path, init)
    }
    expect(await sendVoice(recording)).toEqual({ kind: "synced" })
    expect(fakes.home?.getSnapshot().held).toEqual(["t1"])
    expect(sent.some((path) => path.includes("of=studio"))).toBe(true)
    expect(waiting()).toBe(0)
  })
})

describe("the drama's scene notes (HF2)", () => {
  it("sends one recorded and never shared, as the next scene's", async () => {
    setUp(5, {})
    fakes.scene = [
      {
        id: "s1",
        durationMs: 4000,
        mimeType: "audio/mp4",
        at: "2026-10-31T08:00:00.000Z",
      },
    ]
    const sent: Array<string> = []
    const recording: HomeCall = (method, path, init) => {
      sent.push(path)
      return send(method, path, init)
    }
    expect(await sendVoice(recording)).toEqual({ kind: "synced" })
    // `toContain`, not `toEqual`: Studio's take, once its test has handed it
    // in, stays handed in for the module (`keepStudio` has no undo), so it
    // goes too.
    expect(fakes.home?.getSnapshot().held).toContain("s1")
    expect(sent).toContain(
      "/voice-notes/s1?of=scene&ref=next-scene&at=2026-10-31T08%3A00%3A00.000Z"
    )
  })
})

describe("the soundbites, once their page hands them in (HF5)", () => {
  /** What the soundbites' store answers its next list with. */
  let listed: () => Promise<Array<Soundbite>> = () => Promise.resolve([])
  const bite: Soundbite = {
    id: "b1",
    recordedAt: "2026-10-31T08:30:00.000Z",
    durationMs: 5000,
    mimeType: "audio/webm",
    bytes: 4,
    context: {
      source: "reminder",
      lastSessionAt: null,
      openSessions: 0,
      timeZone: "UTC",
    },
  }
  // Last: `keepSoundbites` has no undo, so every test after would list them.
  beforeAll(() => {
    keepSoundbites({
      store: {
        list: () => listed(),
        audio: (id: string) =>
          Promise.resolve(id === "b1" ? new Blob(["bite"]) : null),
        subscribe: () => (): void => undefined,
      },
      heldByHome: (): void => undefined,
    })
  })

  it("are copied as soundbites, and each read tells the lane's count", async () => {
    setUp(5, {})
    listed = (): Promise<Array<Soundbite>> => Promise.resolve([bite])
    const heard = vi.fn()
    const stop = storesRead.subscribe(heard)
    const sent: Array<string> = []
    const recording: HomeCall = (method, path, init) => {
      sent.push(path)
      return send(method, path, init)
    }
    expect(await sendVoice(recording)).toEqual({ kind: "synced" })
    stop()
    expect(heard).toHaveBeenCalled()
    expect(fakes.home?.getSnapshot().held).toContain("b1")
    expect(sent.some((path) => path.includes("of=soundbite"))).toBe(true)
  })

  it("that can't be listed are reported, fail the run as the phone's fault, and hold back none of the others", async () => {
    setUp(5, { v1: new Blob(["a"]) })
    fakes.scene = [
      {
        id: "s1",
        durationMs: 4000,
        mimeType: "audio/mp4",
        at: "2026-10-31T09:00:00.000Z",
      },
    ]
    listed = (): Promise<Array<Soundbite>> =>
      Promise.reject(new Error("metadata unreadable"))
    vi.mocked(reportFailure).mockClear()
    expect(await sendVoice(send)).toEqual({ kind: "failed", why: "fault" })
    // The Jobs note and the scene note after it went all the same.
    expect(fakes.home?.getSnapshot().held).toEqual(
      expect.arrayContaining(["v1", "s1"])
    )
    expect(vi.mocked(reportFailure)).toHaveBeenCalledWith(
      expect.objectContaining({ port: "voice notes (list soundbites)" })
    )
  })
})
