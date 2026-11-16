/**
 * The interview week's exchange with home (IW5): the weeks come through
 * `readWeek`, the first copy of an id is kept, one that can't be read is
 * marked and not read again, and the latest send of each open week goes.
 */
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { inMemoryStorage } from "@some-ui/core-utils"
import type { Mock } from "vitest"
import { describe, expect, it, vi } from "vitest"

import {
  exchangeInterviewWeeks,
  interviewGoing,
} from "@/lib/interview-week/home"
import type { InterviewSent } from "@/lib/interview-week/spec"
import { heldWeeks, interviewSent } from "@/lib/interview-week/store"

import { WEEK } from "./fixture"

const answer = (status: number, body: unknown = ""): Promise<HomeAnswer> =>
  Promise.resolve({
    status,
    body: typeof body === "string" ? body : JSON.stringify(body),
  })

function home(weeks: Record<string, unknown>): Mock<HomeCall> {
  return vi.fn<HomeCall>((_method, path) => {
    if (path === "/interview-weeks") {
      return answer(200, {
        weeks: Object.keys(weeks).map((id) => ({
          id,
          sha256: `${id}-sha`,
          receivedAt: "2026-11-16T12:00:00Z",
        })),
      })
    }
    const id = decodeURIComponent(path.split("/")[2] ?? "")
    return id in weeks
      ? answer(200, { id, sha256: `${id}-sha`, week: weeks[id] })
      : answer(404)
  })
}

describe("the interview weeks from home (IW5)", () => {
  it("keeps a week that reads, and marks one that doesn't, once", async () => {
    const storage = inMemoryStorage()
    const store = heldWeeks(storage)
    const send = home({ "2026-w47": WEEK, "2026-w46": { schema: "nope" } })
    expect(await exchangeInterviewWeeks(store, send)).toEqual({
      kind: "synced",
    })
    expect(store.held().weeks.map(({ week }) => week.id)).toEqual(["2026-w47"])
    expect(store.held().unread).toEqual(["2026-w46@2026-w46-sha"])

    const again = home({ "2026-w47": WEEK, "2026-w46": { schema: "nope" } })
    await exchangeInterviewWeeks(store, again)
    // Only the list: nothing held or marked is read again.
    expect(again).toHaveBeenCalledTimes(1)
  })

  it("is forgotten when home no longer knows this phone", async () => {
    const send = vi.fn<HomeCall>(() => answer(401))
    expect(
      await exchangeInterviewWeeks(heldWeeks(inMemoryStorage()), send)
    ).toEqual({ kind: "forgotten" })
  })
})

describe("the sends that go home", () => {
  const sent = (at: string): InterviewSent => ({
    week: WEEK.id,
    at,
    answers: [{ question: "conflict", take: "t1", recordedAt: at }],
    reads: [],
    passed: ["walk-me-through", "why-now", "decision-c266"],
    passedReads: ["epic-2931", "invariant-rs1"],
  })

  it("are the latest of each week, until its deadline", () => {
    const storage = inMemoryStorage()
    heldWeeks(storage).hold({
      weeks: [{ week: WEEK, sha256: "a" }],
      unread: [],
    })
    interviewSent(storage).keep(() => [
      sent("2026-11-17T10:00:00.000Z"),
      sent("2026-11-18T10:00:00.000Z"),
    ])
    const going = interviewGoing(storage, Date.parse("2026-11-19T00:00:00Z"))
    expect(going).toEqual([
      {
        id: "2026-w47/2026-11-18T10:00:00.000Z",
        path: "/interview-weeks/2026-w47/sent",
        wire: sent("2026-11-18T10:00:00.000Z"),
      },
    ])
    expect(interviewGoing(storage, Date.parse("2026-11-24T00:00:00Z"))).toEqual(
      []
    )
  })
})
