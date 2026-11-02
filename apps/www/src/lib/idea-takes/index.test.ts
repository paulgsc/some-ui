/** @vitest-environment node */
import { fileURLToPath } from "node:url"
import type {
  HeardAnswer,
  homeHearing as HomeHearing,
  Listened,
} from "@some-ui/soundbites"
import type { BlobShelf, Playback } from "@some-ui/voice-capture"
import { microphoneOwner } from "@some-ui/voice-capture"
import { simulatedMicrophone, SPEAKING } from "@some-ui/voice-capture/testing"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ideaTakesOf } from "@/lib/idea-takes"
import type { Take } from "@/lib/takes-desk"
import { createTakes } from "@/lib/takes-desk/runtime"

const NOW = Date.UTC(2026, 10, 1, 9)

/**
 * Soundbites' own `homeHearing`, loaded from its source: vitest runs the
 * `lan` profile, which stubs `@some-ui/soundbites` (an `apk` workspace) by
 * its name, and these tests run that step over this desk's real port.
 */
const hearingSource: { homeHearing: typeof HomeHearing } = await import(
  fileURLToPath(
    new URL(
      "../../../../../packages/ui/soundbites/src/lib/idea/hearing.ts",
      import.meta.url
    )
  )
)
const { homeHearing } = hearingSource

/** A desk of idea takes over the simulated microphone, kept in memory. */
function desk(max = 40): {
  /** The takes this phone has read back that home holds. */
  holds: Set<string>
  listed: Array<Take>
  mic: ReturnType<typeof simulatedMicrophone>
  takes: ReturnType<typeof ideaTakesOf>
} {
  const now = (): number => Date.now()
  const mic = simulatedMicrophone({ now })
  const listed: Array<Take> = []
  const audio: BlobShelf = {
    put: () => Promise.resolve(),
    get: () => Promise.resolve(new Blob(["v"])),
    remove: () => Promise.resolve(),
    ids: () => Promise.resolve([]),
  }
  let next = 0
  const holds = new Set<string>()
  const phone = createTakes(
    {
      startRecording: mic.startRecording,
      audio,
      takes: {
        read: () => [...listed],
        add: (take): boolean => {
          listed.unshift(take)
          return true
        },
        remove: (): boolean => true,
      },
      saving: () => undefined,
      player: {
        play: (): Playback => ({
          ended: new Promise<void>(() => undefined),
          stop: () => undefined,
        }),
      },
      now,
      newId: () => `take-${++next}`,
      held: (id) => holds.has(id),
      owner: microphoneOwner(),
    },
    { max, maxMs: 60_000 }
  )
  return { holds, listed, mic, takes: ideaTakesOf(phone) }
}

/** One take of two seconds, stopped: the port's snapshot once it ended. */
async function take(
  takes: ReturnType<typeof ideaTakesOf>
): Promise<ReturnType<typeof takes.getSnapshot>> {
  const seen: Array<string> = []
  const stop = takes.subscribe(() => seen.push(takes.getSnapshot().take))
  takes.start("idea:i1:what")
  await vi.advanceTimersByTimeAsync(2_000)
  takes.stop()
  await vi.advanceTimersByTimeAsync(1_000)
  stop()
  return takes.getSnapshot()
}

afterEach(() => {
  vi.useRealTimers()
})

describe("IH1: Studio's idea takes, on the phone's desk, as the take port", () => {
  it("records, keeps the take under what it answers, and names it once ended", async () => {
    vi.useFakeTimers({ now: NOW })
    const { listed, takes } = desk()
    expect(takes.getSnapshot()).toEqual({
      take: "idle",
      ended: null,
      full: false,
    })
    expect(await take(takes)).toEqual({
      take: "idle",
      ended: {
        seq: 1,
        ending: "kept",
        id: "take-1",
        reason: null,
        unheard: false,
      },
      full: false,
    })
    expect(listed.map(({ id, line }) => [id, line])).toEqual([
      ["take-1", "idea:i1:what"],
    ])
  })

  it("says why the microphone refused", async () => {
    vi.useFakeTimers({ now: NOW })
    const { mic, takes } = desk()
    mic.script({ ...SPEAKING, open: { kind: "refuse", reason: "busy", ms: 0 } })
    expect((await take(takes)).ended).toEqual({
      seq: 1,
      ending: "blocked",
      id: null,
      reason: "busy",
      unheard: false,
    })
  })

  it("says it is full once the desk holds as many as it keeps and home holds none", async () => {
    vi.useFakeTimers({ now: NOW })
    const { takes } = desk(1)
    await take(takes)
    expect(takes.getSnapshot().full).toBe(true)
  })
})

/**
 * One answer said through soundbites' `homeHearing` over this desk's port:
 * two seconds into the take, stopped, with home answering `answer` to every
 * ask. What it settled with, if it has, and what it told the screen.
 */
async function said(
  run: ReturnType<typeof desk>,
  answer: HeardAnswer
): Promise<{
  result: () => Listened | null
  asked: Array<string>
  hearing: ReturnType<typeof vi.fn>
}> {
  const asked: Array<string> = []
  const listener = homeHearing({
    takes: run.takes,
    heard: (id) => {
      asked.push(id)
      return Promise.resolve(answer)
    },
    now: () => Date.now(),
    onVisibility: (listener): (() => void) => {
      listener(false)
      return () => undefined
    },
  })
  const hearing = vi.fn()
  let result: Listened | null = null
  const listening = listener.listen(vi.fn(), vi.fn(), {
    answers: "idea:i1:what",
    onHearing: hearing,
  })
  void listening.done.then((settled) => {
    result = settled
  })
  await vi.advanceTimersByTimeAsync(2_000)
  listening.stop()
  await vi.advanceTimersByTimeAsync(1_000)
  return { result: () => result, asked, hearing }
}

describe("IH1: home hearing a take through this desk's port", () => {
  it("gives home's words for the kept take", async () => {
    vi.useFakeTimers({ now: NOW })
    const run = desk()
    const heard = await said(run, { kind: "heard", text: "the picks" })
    expect(heard.hearing).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(heard.asked).toEqual(["take-1"])
    expect(heard.result()).toEqual({ kind: "heard", words: "the picks" })
  })

  it("says at once that nothing was heard in a silent take, asking home nothing", async () => {
    vi.useFakeTimers({ now: NOW })
    const run = desk()
    run.mic.script({ ...SPEAKING, level: 0 })
    const heard = await said(run, { kind: "notYet" })
    expect(heard.result()).toEqual({ kind: "heard", words: "" })
    expect(heard.hearing).not.toHaveBeenCalled()
    expect(run.listed.map(({ id }) => id)).toEqual(["take-1"])
    expect(heard.asked).toEqual([])
  })

  it("reads where the take is from what the desk has read back home holds", async () => {
    vi.useFakeTimers({ now: NOW })
    const run = desk()
    const heard = await said(run, { kind: "notHeld" })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(heard.result()).toBeNull()
    run.holds.add("take-1")
    await vi.advanceTimersByTimeAsync(5_000)
    expect(heard.result()).toEqual({
      kind: "kept",
      on: "home",
      why: "noWords",
    })
  })
})
