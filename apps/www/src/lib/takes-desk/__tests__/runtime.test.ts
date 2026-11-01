import type {
  BlobShelf,
  ObservedEnding,
  Playback,
  StartRecording,
} from "@some-ui/voice-capture"
import { microphoneOwner, TAKE_ENDING_WORDS } from "@some-ui/voice-capture"
import type {
  ScenarioBuild,
  ScenarioPhone,
  ScenarioScreen,
} from "@some-ui/voice-capture/testing"
import {
  assertTakeProperties,
  simulatedMicrophone,
  SPEAKING,
} from "@some-ui/voice-capture/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Take, TakesPorts } from "@/lib/takes-desk/runtime"
import { createTakes, homeHolds } from "@/lib/takes-desk/runtime"
import type { VoiceOut } from "@/lib/voice-home/model"
import {
  INITIAL_VOICE_HOME,
  keptIn,
  stepVoiceHome,
} from "@/lib/voice-home/model"

const LENS_TAKES_MAX = 40
const LIMITS = { max: LENS_TAKES_MAX, maxMs: 30_000 }

/** The shared simulated microphone, hearing four seconds of speech per take. */
function speaking(): StartRecording {
  return simulatedMicrophone({
    now: Date.now,
    fallback: { ...SPEAKING, durationMs: 4_000 },
  }).startRecording
}

const NOW = 1_760_000_000_000

function ports(listed: Array<Take> = []): TakesPorts & {
  listed: Array<Take>
  audio: BlobShelf
  ended: () => void
  home: Set<string>
} {
  const home = new Set<string>()
  const audio: BlobShelf = {
    put: vi.fn(() => Promise.resolve()),
    get: () => Promise.resolve(new Blob(["abc"])),
    remove: vi.fn(() => Promise.resolve()),
    ids: () => Promise.resolve([]),
  }
  let now = NOW
  let next = 0
  let end: () => void = () => undefined
  return {
    listed,
    audio,
    home,
    held: (id) => home.has(id),
    ended: () => end(),
    startRecording: speaking(),
    takes: {
      read: () => [...listed],
      add: (take): boolean => {
        listed.unshift(take)
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
    player: {
      play: (): Playback => ({
        ended: new Promise<void>((resolve) => {
          end = resolve
        }),
        stop: vi.fn(),
      }),
    },
    now: () => (now += 2_000),
    newId: () => `t${(next += 1)}`,
    // Each test's own: a take one test leaves holds no other's microphone.
    owner: microphoneOwner(),
  }
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

/** One take of `line`, start to kept. */
async function take(
  takes: ReturnType<typeof createTakes>,
  line = "school-bus"
): Promise<void> {
  takes.start(line)
  await settle()
  takes.stop()
  await settle()
}

const kept = (id: string, takenAt: number): Take => ({
  id,
  line: "older",
  takenAt,
  durationMs: 3_000,
  mimeType: "audio/webm",
})

describe("createTakes", () => {
  it("says a kept take it didn't hear, measured below the floor (D4)", async () => {
    vi.useFakeTimers()
    try {
      const p = ports()
      p.startRecording = simulatedMicrophone({
        now: Date.now,
        fallback: { ...SPEAKING, durationMs: 4_000, level: 0.03 },
      }).startRecording
      const takes = createTakes({ ...p, owner: microphoneOwner() }, LIMITS)
      takes.start("school-bus")
      await vi.advanceTimersByTimeAsync(1_000)
      takes.stop()
      await vi.advanceTimersByTimeAsync(0)
      expect(takes.getSnapshot()).toMatchObject({
        ended: { end: "kept" },
        said: TAKE_ENDING_WORDS.unheard,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("keeps a take of the line, audio then entry, as the item's last", async () => {
    const p = ports()
    const takes = createTakes(p, LIMITS)
    await take(takes)
    expect(p.audio.put).toHaveBeenCalledOnce()
    expect(p.listed).toMatchObject([{ id: "t1", line: "school-bus" }])
    expect(takes.getSnapshot()).toMatchObject({
      take: { kind: "idle" },
      last: { id: "t1", durationMs: 4_000 },
      said: "Kept.",
    })
  })

  it("says how every take ended and on what line, through a reset's hush", async () => {
    const p = ports()
    const takes = createTakes(p, LIMITS)
    takes.start("rust-rounds:indexing-01/a")
    await settle()
    takes.reset()
    takes.stop()
    await settle()
    expect(takes.getSnapshot()).toMatchObject({
      said: null,
      ended: {
        seq: 1,
        line: "rust-rounds:indexing-01/a",
        end: "kept",
        id: "t1",
      },
    })
    await take(takes, "rust-rounds:indexing-01/b")
    expect(takes.getSnapshot().ended).toMatchObject({ seq: 2, id: "t2" })
  })

  it("forgets the last take on reset, and never makes a late save the next item's", async () => {
    const p = ports()
    const takes = createTakes(p, LIMITS)
    await take(takes)
    takes.reset()
    expect(takes.getSnapshot()).toMatchObject({ last: null, said: null })
    takes.start("next-line")
    await settle()
    // The item ends mid-take: it is kept, but is not the new item's.
    takes.reset()
    await settle()
    expect(p.listed.map(({ id }) => id)).toEqual(["t2", "t1"])
    expect(takes.getSnapshot().last).toBeNull()
    // Still named as kept, for the record to count on its own item.
    expect(takes.getSnapshot().kept).toEqual({ id: "t2", durationMs: 4_000 })
  })

  it("refuses a take past forty while home holds none, evicting none", async () => {
    const full = Array.from({ length: LENS_TAKES_MAX }, (_, index) =>
      kept(`old-${index}`, NOW - 400 * 24 * 60 * 60 * 1000 - index)
    )
    const p = ports(full)
    const takes = createTakes(p, LIMITS)
    expect(takes.getSnapshot().full).toBe(true)
    takes.start("school-bus")
    await settle()
    expect(takes.getSnapshot().take.kind).toBe("idle")
    expect(p.audio.put).not.toHaveBeenCalled()
    expect(p.audio.remove).not.toHaveBeenCalled()
    expect(p.listed).toHaveLength(LENS_TAKES_MAX)
    takes.letGo(["old-0", "old-1"])
    expect(p.audio.remove).toHaveBeenCalledWith(["old-0", "old-1"])
    expect(takes.getSnapshot().full).toBe(false)
    await take(takes)
    expect(p.listed[0]?.id).toBe("t1")
    expect(p.listed).toHaveLength(LENS_TAKES_MAX - 1)
  })

  it("refuses a take at forty while the others only wait to go home, letting none go (MIC3)", async () => {
    const full = Array.from({ length: LENS_TAKES_MAX }, (_, index) =>
      kept(`old-${index}`, NOW - index)
    )
    const p = ports(full)
    // Every copy waits in the voice lane; home holds none of them yet.
    const lane = full.reduce(
      (state, { id }) =>
        stepVoiceHome(state, {
          kind: "copied",
          note: {
            id,
            of: "lens",
            ref: "older",
            at: new Date(NOW).toISOString(),
            contentType: "audio/webm",
          } satisfies VoiceOut,
        }),
      INITIAL_VOICE_HOME
    )
    const where = keptIn(lane)
    expect(where("old-0")).toEqual({ place: "going" })
    // As the desk reads `held` from where each take is (`../index`).
    const takes = createTakes(
      { ...p, held: (id) => homeHolds(where(id)) },
      LIMITS
    )
    expect(takes.getSnapshot().full).toBe(true)
    takes.start("school-bus")
    await settle()
    expect(takes.getSnapshot().take.kind).toBe("idle")
    expect(p.audio.put).not.toHaveBeenCalled()
    expect(p.audio.remove).not.toHaveBeenCalled()
    expect(p.listed).toHaveLength(LENS_TAKES_MAX)
  })

  it("makes room at forty by letting go the oldest take home holds, and only one home holds (HF5)", async () => {
    const full = Array.from({ length: LENS_TAKES_MAX }, (_, index) =>
      kept(`old-${index}`, NOW - index)
    )
    const p = ports(full)
    const takes = createTakes(p, LIMITS)
    p.home.add("old-2").add("old-5")
    expect(takes.getSnapshot().full).toBe(true)
    takes.recount()
    expect(takes.getSnapshot().full).toBe(false)
    await take(takes)
    // old-5 is older than old-2: it goes, and nothing home lacks.
    expect(p.audio.remove).toHaveBeenCalledWith(["old-5"])
    expect(p.listed.map(({ id }) => id)).not.toContain("old-5")
    expect(p.listed.map(({ id }) => id)).toContain("old-2")
    expect(p.listed).toHaveLength(LENS_TAKES_MAX)
    expect(p.listed[0]?.id).toBe("t1")
  })

  it("keeps nothing when the room it makes at forty is not stored, dropping none home lacks (RM1)", async () => {
    const full = Array.from({ length: LENS_TAKES_MAX }, (_, index) =>
      kept(`old-${index}`, NOW - index)
    )
    const p = ports(full)
    p.takes.remove = (): boolean => false
    const takes = createTakes(p, LIMITS)
    p.home.add("old-5")
    takes.recount()
    await take(takes)
    expect(takes.getSnapshot().ended?.end).toBe("failed")
    expect(p.audio.put).not.toHaveBeenCalled()
    expect(p.listed.map(({ id }) => id)).toEqual(full.map(({ id }) => id))
  })

  it("is full once a kept take is the fortieth", async () => {
    const p = ports(
      Array.from({ length: LENS_TAKES_MAX - 1 }, (_, index) =>
        kept(`old-${index}`, NOW - index)
      )
    )
    const takes = createTakes(p, LIMITS)
    expect(takes.getSnapshot().full).toBe(false)
    await take(takes)
    expect(takes.getSnapshot().full).toBe(true)
  })

  it("keeps a take's audio when the phone would not store its letting go", () => {
    const p = ports([kept("old", NOW)])
    p.takes.remove = (): boolean => false
    createTakes(p, LIMITS).letGo(["old"])
    expect(p.audio.remove).not.toHaveBeenCalled()
  })

  it("refuses a take that reaches the bound while it is recorded", async () => {
    const almost = Array.from({ length: LENS_TAKES_MAX - 1 }, (_, index) =>
      kept(`old-${index}`, NOW - index)
    )
    const p = ports(almost)
    const takes = createTakes(p, LIMITS)
    takes.start("school-bus")
    await settle()
    p.listed.unshift(kept("elsewhere", NOW))
    takes.stop()
    await settle()
    expect(p.audio.put).not.toHaveBeenCalled()
    expect(takes.getSnapshot().said).toMatch(/no room/i)
  })

  it("ends a playback on stop, as when the page is hidden", async () => {
    const p = ports()
    const takes = createTakes(p, LIMITS)
    await take(takes)
    takes.playLast()
    await settle()
    takes.stop()
    expect(takes.getSnapshot().playing).toBe(false)
  })

  it("starts no playback whose read lands after a stop", async () => {
    const p = ports()
    const play = vi.spyOn(p.player, "play")
    const takes = createTakes(p, LIMITS)
    await take(takes)
    takes.playLast()
    // Hidden before the audio is read.
    takes.stop()
    await settle()
    expect(play).not.toHaveBeenCalled()
    expect(takes.getSnapshot().playing).toBe(false)
  })

  it("says a playback stopped when Mine is tapped again and the take is gone", async () => {
    const p = ports()
    const takes = createTakes(p, LIMITS)
    await take(takes)
    takes.playLast()
    await settle()
    expect(takes.getSnapshot().playing).toBe(true)
    p.audio.get = (): Promise<Blob | null> => Promise.resolve(null)
    takes.playLast()
    await settle()
    expect(takes.getSnapshot().playing).toBe(false)
  })

  it("plays the last take back, and says when it ends", async () => {
    const p = ports()
    const takes = createTakes(p, LIMITS)
    await take(takes)
    takes.playLast()
    await settle()
    expect(takes.getSnapshot().playing).toBe(true)
    p.ended()
    await settle()
    expect(takes.getSnapshot().playing).toBe(false)
  })
})

/**
 * VC2 and VC3 (`@some-ui/voice-capture`'s `properties.ts`) over the real
 * desk: every generated trace of the scenario family, desks on one phone
 * sharing the simulated microphone, keeps every property. A take a reset
 * left is hushed on purpose (`said` is null), which the monitor exempts by
 * name; its ending is still named, for the caller's own words.
 */
describe("VC2, VC3: every take on the desk ends once, says how, and holds the microphone only while it runs", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // A microphone past its deadline is reported (VC1); not this test's to read.
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /** `count` desks on one phone, their audio on one shelf. */
  const desks =
    (count: number) =>
    (phone: ScenarioPhone): ScenarioBuild => {
      const audio = new Map<string, Blob>()
      const shelf: BlobShelf = {
        put: (id, blob) => {
          audio.set(id, blob)
          return Promise.resolve()
        },
        get: (id) => Promise.resolve(audio.get(id) ?? null),
        remove: (ids) => {
          for (const id of ids) audio.delete(id)
          return Promise.resolve()
        },
        ids: () => Promise.resolve([...audio.keys()]),
      }
      let ids = 0
      const screens = Array.from({ length: count }, (_, at): ScenarioScreen => {
        const takes = createTakes(
          {
            ...ports(),
            audio: shelf,
            startRecording: phone.startRecording,
            owner: phone.owner,
            deadlines: phone.bounds.deadlines,
            now: phone.now,
            newId: () => `t${(ids += 1)}`,
          },
          { max: LENS_TAKES_MAX, maxMs: phone.bounds.limits.maxMs }
        )
        let hushed = false
        return {
          tap: (): void => {
            if (takes.getSnapshot().take.kind !== "idle") {
              takes.stop()
              return
            }
            hushed = false
            takes.start(`line-${at}`)
          },
          leave: (): void => {
            hushed = true
            takes.reset()
          },
          subscribe: takes.subscribe,
          underway: () => takes.getSnapshot().take.kind !== "idle",
          ended: (): ObservedEnding | null => {
            const { ended, said } = takes.getSnapshot()
            if (ended === null) return null
            return {
              seq: ended.seq,
              ending: ended.end,
              id: ended.id,
              said: said ?? "",
              hushed,
            }
          },
        }
      })
      return { screens, audio: () => [...audio.keys()] }
    }

  it("holds on every generated trace", async () => {
    await assertTakeProperties({
      build: desks,
      advance: (ms) => vi.advanceTimersByTimeAsync(ms),
      now: Date.now,
      reset: () => vi.clearAllTimers(),
    })
  })
})
