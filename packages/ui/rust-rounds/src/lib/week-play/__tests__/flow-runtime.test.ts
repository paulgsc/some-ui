/**
 * The week's flow as it runs (RR25): it moves without marking, tells its
 * host the ticket on screen, keeps each tick and pick through the stores
 * once, and says so when the phone can't keep one, leaving the screen as
 * it was.
 */
import { TALLOWBROOK_WEEK_FILE } from "@rust-rounds/lib/sample-week/tallowbrook"
import { readWeek } from "@rust-rounds/lib/week-check"
import type { FlowPorts } from "@rust-rounds/lib/week-play/flow-runtime"
import { createFlow } from "@rust-rounds/lib/week-play/flow-runtime"
import {
  weekMarks,
  weekPicks,
  weekTicks,
} from "@rust-rounds/lib/week-play/store"
import type { KeyedStorage } from "@some-ui/core-utils"
import { inMemoryStorage } from "@some-ui/core-utils"
import { describe, expect, it, vi } from "vitest"

const read = readWeek(TALLOWBROOK_WEEK_FILE)
if (!read.ok) throw new Error("the /2 sample reads")
const WEEK = read.week

const flowOn = (
  storage: KeyedStorage,
  said = false
): { flow: ReturnType<typeof createFlow>; ports: FlowPorts } => {
  const ports: FlowPorts = {
    week: WEEK,
    storage,
    now: () => Date.parse("2026-11-19T10:00:00Z"),
    said: () => said,
    onTicket: vi.fn(),
    onReview: vi.fn(),
  }
  return { flow: createFlow(ports), ports }
}

describe("the flow runtime", () => {
  it("moves without marking, and tells the host each ticket it reaches", () => {
    const storage = inMemoryStorage()
    const { flow, ports } = flowOn(storage)
    expect(flow.getSnapshot().at).toBe(0)
    flow.dispatch({ type: "go", index: 1 })
    expect(ports.onTicket).not.toHaveBeenCalled()
    flow.dispatch({ type: "go", index: 3 })
    expect(ports.onTicket).toHaveBeenLastCalledWith("TB-102")
    flow.dispatch({ type: "go", index: 99 })
    expect(flow.getSnapshot().at).toBe(3)
    flow.dispatch({ type: "openTicket", ticket: "TB-101" })
    expect(flow.getSnapshot().at).toBe(0)
    expect(weekMarks(storage).list() ?? []).toEqual([])
  })

  it("keeps a tick and a pick once each, for the ticket on screen, in this week", () => {
    const storage = inMemoryStorage()
    const { flow } = flowOn(storage)
    flow.dispatch({ type: "go", index: 1 })
    flow.dispatch({ type: "exercise", n: 1 })
    flow.dispatch({ type: "tick", n: 1 })
    flow.dispatch({ type: "tick", n: 1 })
    expect(weekTicks(storage).list()).toEqual([
      {
        week: WEEK.id,
        ticket: "TB-101",
        exercise: 1,
        at: "2026-11-19T10:00:00.000Z",
      },
    ])
    flow.dispatch({ type: "pick", fork: 1, pick: { kind: "own" } })
    flow.dispatch({ type: "pick", fork: 1, pick: { kind: "own" } })
    flow.dispatch({ type: "pick", fork: 9, pick: { kind: "own" } })
    expect(
      weekPicks(storage)
        .list()
        ?.map(({ fork, pick }) => [fork, pick])
    ).toEqual([[1, { kind: "own" }]])
    // Leaving the academy with an exercise ticked: gone through, on to voice.
    flow.dispatch({ type: "leave", how: "onward" })
    expect(flow.getSnapshot()).toMatchObject({ at: 2, exercise: null })
    expect(
      weekMarks(storage)
        .list()
        ?.map(({ mark }) => mark)
    ).toEqual(["done"])
  })

  it("marks the voice said and asks for the look over", () => {
    const storage = inMemoryStorage()
    const { flow, ports } = flowOn(storage, true)
    flow.dispatch({ type: "go", index: 2 })
    flow.dispatch({ type: "review" })
    expect(ports.onReview).toHaveBeenCalledOnce()
    expect(
      weekMarks(storage)
        .list()
        ?.map(({ step, mark }) => [step, mark])
    ).toEqual([["voice", "done"]])
  })

  it("says a change it couldn't keep, and changes nothing on screen", () => {
    const storage = inMemoryStorage()
    const { flow } = flowOn(storage)
    const full: KeyedStorage = {
      ...storage,
      getItem: (key) => storage.getItem(key),
      setItem: () => {
        throw new Error("full")
      },
      removeItem: (key) => storage.removeItem(key),
    }
    const refused = createFlow({ ...flowOn(full).ports, storage: full })
    refused.dispatch({ type: "leave", how: "onward" })
    expect(refused.getSnapshot()).toMatchObject({ at: 0, notice: "notKept" })
    refused.dispatch({ type: "noticeDismissed" })
    // The look over opens all the same: the mark never gates it.
    const review = flowOn(full)
    const looks = createFlow({ ...review.ports, storage: full })
    looks.dispatch({ type: "review" })
    expect(review.ports.onReview).toHaveBeenCalledOnce()
    expect(looks.getSnapshot().notice).toBe("notKept")
    refused.dispatch({ type: "pick", fork: 1, pick: { kind: "own" } })
    expect(refused.getSnapshot()).toMatchObject({
      picks: [],
      notice: "notKept",
    })
    expect(flow.getSnapshot().notice).toBeNull()
  })
})
