/**
 * W5: Spoken's runtime over the real take pattern on a simulated
 * microphone: a pasted spoken card kept, a part's takes recorded and seen (SCR1),
 * a take played from the phone or from home.
 */
import { inMemoryStorage } from "@some-ui/core-utils"
import type { HeardAnswer } from "@some-ui/voice-capture"
import type { SimulatedPattern } from "@some-ui/voice-capture/testing"
import { simulatedPattern } from "@some-ui/voice-capture/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { bandPace } from "@/lib/interview-week/store"
import { lineOf, parseCard } from "@/lib/studio-spoken/model"
import type { SpokenPorts, SpokenRuntime } from "@/lib/studio-spoken/runtime"
import { createSpokenRuntime } from "@/lib/studio-spoken/runtime"
import { spokenStore } from "@/lib/studio-spoken/store"
import { deskPatternOptions } from "@/lib/takes-desk/pattern"

const PASTED = parseCard(
  "Showcase\n\nSCRIPT\nQUESTION What is it?\nIt is a week of Rust.\n\nOWN WORDS\nWhy?"
)

function setup(overrides: Partial<SpokenPorts> = {}): {
  sim: SimulatedPattern
  storage: ReturnType<typeof inMemoryStorage>
  runtime: SpokenRuntime
} {
  const sim = simulatedPattern({
    options: deskPatternOptions(
      { max: 40, maxMs: 180_000 },
      { takes: { per: "many", max: 40, full: "refuse" }, play: "each" }
    ),
  })
  const storage = inMemoryStorage()
  let seen: ReadonlyArray<{ id: string; line: string }> = []
  let from: unknown = null
  const ports: SpokenPorts = {
    store: spokenStore(storage),
    pace: bandPace(storage),
    takes: {
      getSnapshot: () => {
        const now = sim.store.getSnapshot()
        if (now !== from) {
          from = now
          seen = now.map((take) => ({ id: take.id, line: take.answers }))
        }
        return seen
      },
      subscribe: sim.store.subscribe,
    },
    pattern: sim.pattern,
    audioHere: () => Promise.resolve(null),
    audioFromHome: () =>
      Promise.resolve(new Blob(["x"], { type: "audio/webm" })),
    heard: (): Promise<HeardAnswer> =>
      Promise.resolve({ kind: "heard", text: "It is a week" }),
    player: sim.player,
    now: () => Date.UTC(2026, 10, 20, 22),
    random: () => 0.25,
    ...overrides,
  }
  const runtime = createSpokenRuntime(ports)
  return { sim, storage, runtime }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-20T22:00:00Z"))
})

afterEach(() => {
  vi.useRealTimers()
})

const pass = async (ms = 0): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms)
}

/** Says a part: a tap, talk, a tap. */
async function say(
  pattern: { tap: (answers: string, supersedes: string | null) => void },
  line: string
): Promise<void> {
  pattern.tap(line, null)
  await pass(2_000)
  pattern.tap(line, null)
  await pass()
}

describe("Spoken's runtime", () => {
  it("keeps a pasted script on this phone, newest first", () => {
    const { runtime, storage } = setup()
    expect(PASTED).not.toBeNull()
    const id = runtime.keep(PASTED!)
    expect(id).not.toBeNull()
    expect(runtime.scripts.getSnapshot()[0]?.title).toBe("Showcase")
    // What a runtime made again would read.
    expect(spokenStore(storage).read()[0]?.id).toBe(id)
  })

  it("says when this phone couldn't keep the script", () => {
    const { runtime } = setup({
      store: { read: () => [], write: () => false },
    })
    expect(runtime.keep(PASTED!)).toBeNull()
    expect(runtime.scripts.getSnapshot()).toEqual([])
  })

  it("adds each take recorded under a part's line to that part (SCR1)", async () => {
    const { runtime, sim } = setup()
    const id = runtime.keep(PASTED!)!
    const leave = runtime.attach()
    await say(sim.pattern, lineOf(id, 0))
    expect(runtime.scripts.getSnapshot()[0]?.parts[0]?.takes).toHaveLength(1)
    await say(sim.pattern, lineOf(id, 0))
    // Said again: one more, the first kept.
    expect(runtime.scripts.getSnapshot()[0]?.parts[0]?.takes).toHaveLength(2)
    const [take] = runtime.scripts.getSnapshot()[0]?.parts[0]?.takes ?? []
    runtime.use(id, 0, take)
    expect(runtime.scripts.getSnapshot()[0]?.parts[0]?.using).toBe(take)
    // Only the part it answers has it.
    expect(runtime.scripts.getSnapshot()[0]?.parts[1]?.takes).toEqual([])
    leave()
  })

  it("plays a take from home when this phone holds none, and says when neither can", async () => {
    const { runtime, sim } = setup()
    runtime.play("t1")
    expect(runtime.playing.getSnapshot()).toEqual({ kind: "asking", id: "t1" })
    await pass()
    expect(runtime.playing.getSnapshot()).toEqual({ kind: "playing", id: "t1" })
    sim.player.finish()
    await pass()
    expect(runtime.playing.getSnapshot()).toEqual({ kind: "quiet" })
    const none = setup({ audioFromHome: () => Promise.resolve(null) })
    none.runtime.play("t2")
    await pass()
    expect(none.runtime.playing.getSnapshot()).toEqual({
      kind: "missed",
      id: "t2",
    })
  })

  it("asks home once what it heard in each take, until it heard it", async () => {
    const heard = vi.fn(
      (): Promise<HeardAnswer> =>
        Promise.resolve({ kind: "heard", text: "It is" })
    )
    const { runtime } = setup({ heard })
    runtime.askHeard(["t1", "t2"])
    await pass()
    expect(Object.keys(runtime.heard.getSnapshot())).toHaveLength(2)
    runtime.askHeard(["t1"])
    expect(heard).toHaveBeenCalledTimes(2)
  })
})
