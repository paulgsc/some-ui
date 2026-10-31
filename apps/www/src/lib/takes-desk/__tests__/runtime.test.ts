import type {
  BlobShelf,
  Playback,
  Recording,
  VoiceNoteEnd,
} from "@some-ui/voice-capture"
import {
  RECORDING_FAILURE_COPY,
  RecordingError,
  VOICE_NOTE_SAID,
} from "@some-ui/voice-capture"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Take, TakesPorts } from "@/lib/takes-desk/runtime"
import { createTakes } from "@/lib/takes-desk/runtime"

const LENS_TAKES_MAX = 40
const LIMITS = { max: LENS_TAKES_MAX, maxMs: 30_000 }

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

const NOW = 1_760_000_000_000

function ports(listed: Array<Take> = []): TakesPorts & {
  listed: Array<Take>
  audio: BlobShelf
  ended: () => void
} {
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
    ended: () => end(),
    startRecording: () => Promise.resolve(recording(4_000)),
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

  it("refuses a take past forty, evicting none, until shared takes are let go", async () => {
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
 * VC2 (`@some-ui/voice-capture`'s `voice-note.ts`) over the real desk: each
 * order of start, stop and leave (`reset`) against a microphone that opens
 * on cue, late, never or refuses ends the take exactly once, with words for
 * how it ended, and holds no microphone it opened too late.
 */
describe("VC2: every take on the desk ends once, and says how", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /** A microphone that answers when the test says, or never. */
  function cued(p: TakesPorts): {
    open: () => void
    refuse: () => void
    mic: Recording
  } {
    const mic = recording(4_000)
    let answer: { open: () => void; refuse: () => void } = {
      open: () => undefined,
      refuse: () => undefined,
    }
    p.startRecording = (): Promise<Recording> =>
      new Promise<Recording>((resolve, reject) => {
        answer = {
          open: (): void => resolve(mic),
          refuse: (): void => reject(new RecordingError("denied")),
        }
      })
    return {
      open: (): void => answer.open(),
      refuse: (): void => answer.refuse(),
      mic,
    }
  }

  type Order = {
    readonly name: string
    readonly run: (
      takes: ReturnType<typeof createTakes>,
      mic: ReturnType<typeof cued>
    ) => Promise<void>
    readonly end: VoiceNoteEnd
    /** `reset` hushes what is said; the end is still named. */
    readonly hushed?: boolean
    /** The microphone opened after the take was let go. */
    readonly letGo?: boolean
  }

  const ORDERS: ReadonlyArray<Order> = [
    {
      name: "stopped before the microphone opens, which then opens",
      run: async (takes, mic): Promise<void> => {
        takes.stop()
        mic.open()
        await settle()
      },
      end: "early",
      letGo: true,
    },
    {
      name: "stopped before a microphone that never opens",
      run: async (takes): Promise<void> => {
        takes.stop()
        await settle()
      },
      end: "early",
    },
    {
      name: "stopped before the microphone refuses",
      run: async (takes, mic): Promise<void> => {
        takes.stop()
        mic.refuse()
        await settle()
      },
      end: "early",
    },
    {
      name: "left before the microphone opens, which then opens",
      run: async (takes, mic): Promise<void> => {
        takes.reset()
        mic.open()
        await settle()
      },
      end: "early",
      hushed: true,
      letGo: true,
    },
    {
      name: "refused before any stop",
      run: async (takes, mic): Promise<void> => {
        mic.refuse()
        await settle()
        takes.stop()
        await settle()
      },
      end: "blocked",
    },
    {
      name: "stopped once the microphone opened",
      run: async (takes, mic): Promise<void> => {
        mic.open()
        await settle()
        takes.stop()
        await settle()
      },
      end: "kept",
    },
    {
      name: "left once the microphone opened",
      run: async (takes, mic): Promise<void> => {
        mic.open()
        await settle()
        takes.reset()
        await settle()
      },
      end: "kept",
      hushed: true,
    },
  ]

  it.each(ORDERS)("$name", async ({ run, end, hushed, letGo }) => {
    const p = ports()
    const mic = cued(p)
    const takes = createTakes(p, LIMITS)
    takes.start("school-bus")
    await settle()
    expect(takes.getSnapshot().take.kind).toBe("opening")
    await run(takes, mic)
    await settle()
    const snapshot = takes.getSnapshot()
    expect(snapshot.take.kind).toBe("idle")
    expect(snapshot.ended).toMatchObject({ seq: 1, line: "school-bus", end })
    const words =
      end === "blocked" ? RECORDING_FAILURE_COPY.denied : VOICE_NOTE_SAID[end]
    expect(snapshot.said).toBe(hushed === true ? null : words)
    if (letGo === true) expect(mic.mic.discard).toHaveBeenCalledOnce()
  })

  it("ends a take whose microphone never answers once the wait runs out", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const p = ports()
    cued(p)
    const takes = createTakes(p, LIMITS)
    takes.start("school-bus")
    await vi.advanceTimersByTimeAsync(60_000)
    expect(takes.getSnapshot()).toMatchObject({
      take: { kind: "idle" },
      ended: { seq: 1, end: "blocked" },
      said: RECORDING_FAILURE_COPY.failed,
    })
  })
})
