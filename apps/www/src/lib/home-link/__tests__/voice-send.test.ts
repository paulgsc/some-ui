/**
 * @vitest-environment jsdom
 *
 * The voice lane's run end to end over fake stores (LA14): a copy pass, then
 * the exchange. A note whose audio is gone fails no run and stops counting
 * as waiting; one with no room fails the run as the phone's lack of room,
 * still waits, and goes once there is room; one the phone fails to copy
 * fails the run as the phone's fault.
 */
import type { HomeCall } from "@some-ui/core-utils"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import type { BlobShelf } from "@some-ui/voice-capture"
import { ShelfFullError } from "@some-ui/voice-capture"
import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { voiceLane } from "@/lib/home-link/voice"
import { sendVoice } from "@/lib/home-link/voice-copy"
import type { JobEvent, JobsState } from "@/lib/jobs/model"
import { EMPTY } from "@/lib/jobs/model"
import type { VoiceHome } from "@/lib/voice-home/runtime"
import { createVoiceHome } from "@/lib/voice-home/runtime"

const fakes = vi.hoisted(
  (): {
    jobs: { state: JobsState } | null
    audio: Map<string, Blob | Error>
    home: VoiceHome | null
  } => ({ jobs: null, audio: new Map(), home: null })
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
  onPromptShared: () => (): void => undefined,
}))
vi.mock("@/lib/voice-home", () => ({
  phoneVoiceHome: (): VoiceHome | null => fakes.home,
}))
vi.mock("@/lib/home-link/lanes", () => ({
  keptNow: (): boolean => true,
  useLaneHome: (): unknown => null,
}))
vi.mock("@/lib/home-link/consent-runtime", () => ({ phoneConsent: vi.fn() }))
vi.mock("@/lib/home-link", () => ({ homeLink: vi.fn() }))
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

/** A Jobs record naming `ids`, each with its audio on this phone or not. */
function record(ids: ReadonlyArray<string>): { state: JobsState } {
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
  return {
    state: {
      ...EMPTY,
      log: [passed],
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

function setUp(room: number, audio: Record<string, Blob | Error | null>): void {
  fakes.jobs = record(Object.keys(audio))
  fakes.audio = new Map(
    Object.entries(audio).flatMap(([id, a]) => (a === null ? [] : [[id, a]]))
  )
  fakes.home = createVoiceHome({
    storage: memoryStorage(),
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
})
