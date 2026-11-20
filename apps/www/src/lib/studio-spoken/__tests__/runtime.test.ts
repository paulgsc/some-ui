/**
 * W5: Spoken's runtime over the real take pattern on a simulated
 * microphone: a pasted card kept, only a part's own takes seen as its, and
 * a take played from home, or said to be unplayable.
 */
import type { HeardAnswer } from "@some-ui/voice-capture"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { PastedCard } from "@/lib/studio-spoken/model"
import { lineOf } from "@/lib/studio-spoken/model"
import { spokenStore } from "@/lib/studio-spoken/store"

import { spokenPhone } from "./fixture"

const PASTED: PastedCard = {
  title: "Showcase",
  category: "introduction",
  parts: [
    { id: null, kind: "read", ask: "What is it?", text: "A week of Rust." },
    { id: null, kind: "own", ask: null, text: "Why?" },
  ],
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

describe("Spoken's runtime", () => {
  it("keeps a pasted card on this phone, and says when it couldn't", () => {
    const { runtime, storage } = spokenPhone()
    const id = runtime.keep(PASTED)
    expect(spokenStore(storage).read()[0]?.id).toBe(id)
    const full = spokenPhone({ store: { read: () => [], write: () => false } })
    expect(full.runtime.keep(PASTED)).toBeNull()
    expect(full.runtime.cards.getSnapshot()).toEqual([])
  })

  it("adds a take only to the part whose line it answers, with no Spoken page open (SCR1)", async () => {
    const { runtime, sim } = spokenPhone()
    const id = runtime.keep(PASTED) ?? ""
    sim.pattern.tap(lineOf(id, 1), null)
    await pass(2_000)
    sim.pattern.tap(lineOf(id, 1), null)
    await pass()
    const parts = runtime.cards.getSnapshot().at(0)?.parts
    expect(parts?.map((part) => part.takes.length)).toEqual([0, 1])
  })

  it("lets go of a pick once home says it heard nothing in it (SCR3)", async () => {
    const { runtime, sim } = spokenPhone({
      heard: () => Promise.resolve({ kind: "heard", text: "" }),
    })
    const id = runtime.keep(PASTED) ?? ""
    sim.pattern.tap(lineOf(id, 0), null)
    await pass(2_000)
    sim.pattern.tap(lineOf(id, 0), null)
    await pass()
    const take = runtime.cards.getSnapshot().at(0)?.parts.at(0)?.takes.at(0)
    runtime.use(id, 0, take ?? "")
    expect(runtime.cards.getSnapshot().at(0)?.parts.at(0)?.using).toBe(take)
    // Opening a page asks about each pick.
    runtime.attach()()
    await pass()
    expect(runtime.cards.getSnapshot().at(0)?.parts.at(0)?.using).toBeNull()
    // Once home has said so, the take can't be picked again.
    runtime.use(id, 0, take ?? "")
    expect(runtime.cards.getSnapshot().at(0)?.parts.at(0)?.using).toBeNull()
  })

  it("plays a take from home when this phone holds none, and says when neither can", async () => {
    const { runtime, sim } = spokenPhone()
    runtime.toggle("t1")
    expect(runtime.play.getSnapshot().playback).toEqual({
      kind: "loading",
      id: "t1",
    })
    await pass()
    expect(runtime.play.getSnapshot().playback).toEqual({
      kind: "playing",
      id: "t1",
    })
    sim.player.finish()
    await pass()
    expect(runtime.play.getSnapshot().playback).toEqual({ kind: "quiet" })
    const none = spokenPhone({ audioFromHome: () => Promise.resolve(null) })
    none.runtime.toggle("t2")
    await pass()
    expect(none.runtime.play.getSnapshot().unplayable).toBe("t2")
    const failed = spokenPhone({
      audioFromHome: () => Promise.reject(new Error("no answer")),
    })
    failed.runtime.toggle("t3")
    await pass()
    expect(failed.runtime.play.getSnapshot().unplayable).toBe("t3")
  })

  it("asks home what it heard in each take, until it heard it", async () => {
    const heard = vi.fn(
      (): Promise<HeardAnswer> =>
        Promise.resolve({ kind: "heard", text: "It is" })
    )
    const { runtime } = spokenPhone({ heard })
    runtime.askHeard(["t1", "t2"])
    // Asked again while home answers: no second ask.
    runtime.askHeard(["t1", "t2"])
    await pass()
    expect(Object.keys(runtime.heard.getSnapshot())).toHaveLength(2)
    runtime.askHeard(["t1"])
    expect(heard).toHaveBeenCalledTimes(2)
  })

  it("reads a failed ask of home as unreachable, and asks again later", async () => {
    const heard = vi
      .fn<() => Promise<HeardAnswer>>()
      .mockRejectedValueOnce(new Error("no answer"))
      .mockResolvedValue({ kind: "heard", text: "It is" })
    const { runtime } = spokenPhone({ heard })
    runtime.askHeard(["t1"])
    await pass()
    expect(runtime.heard.getSnapshot()["t1"]).toEqual({ kind: "unreachable" })
    runtime.askHeard(["t1"])
    await pass()
    expect(runtime.heard.getSnapshot()["t1"]).toEqual({
      kind: "heard",
      text: "It is",
    })
  })
})
