/**
 * The shelf half of a send (LA8): one PUT per kept item, its bytes as kept,
 * no retry; home's refusals are counted; a 401 or no answer ends it there;
 * a stop rejects before the next item.
 */
import { noAnswer } from "@/test-support/no-answer"
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import { emptyReport, sendKept } from "@/lib/home-link/shelf"

const KEPT = [
  { activity: "topik", key: "a", body: '{ "a": 1 }' },
  { activity: "topik", key: "b", body: "[1]" },
  { activity: "leetype", key: "d", body: "{}" },
]

function home(answers: Array<HomeAnswer | Error>): {
  send: HomeCall
  sent: Array<[string, string]>
} {
  const sent: Array<[string, string]> = []
  return {
    sent,
    send: (method, path, body): Promise<HomeAnswer> => {
      expect(method).toBe("PUT")
      sent.push([path, body ?? ""])
      const answer = answers.shift() ?? {
        status: 200,
        body: '{"change":"kept"}',
      }
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(answer)
    },
  }
}

const changed = (change: string): HomeAnswer => ({
  status: 200,
  body: JSON.stringify({ change }),
})

describe("sendKept", () => {
  it("puts each item once, as kept, and counts what home did", async () => {
    const h = home([changed("kept"), changed("replaced"), changed("unchanged")])
    const report = emptyReport()
    await sendKept(KEPT, h.send, report)
    expect(h.sent).toEqual([
      ["/shelf/topik/a", '{ "a": 1 }'],
      ["/shelf/topik/b", "[1]"],
      ["/shelf/leetype/d", "{}"],
    ])
    expect(report).toMatchObject({
      sent: 3,
      kept: 1,
      replaced: 1,
      unchanged: 1,
    })
  })

  it("goes on past a full shelf and a refusal, and counts both", async () => {
    const h = home([
      { status: 409, body: "" },
      { status: 422, body: "" },
      changed("kept"),
    ])
    const report = emptyReport()
    await sendKept(KEPT, h.send, report)
    expect(h.sent).toHaveLength(3)
    expect(report).toMatchObject({
      sent: 1,
      kept: 1,
      refused: 1,
      full: new Map([["topik", 1]]),
    })
  })

  it("ends at a 401 or at no answer, and retries nothing", async () => {
    const forgotten = home([changed("kept"), { status: 401, body: "" }])
    const a = emptyReport()
    await sendKept(KEPT, forgotten.send, a)
    expect(forgotten.sent).toHaveLength(2)
    expect(a).toMatchObject({ sent: 1, forgotten: true })

    const lost = home([noAnswer()])
    const b = emptyReport()
    await sendKept(KEPT, lost.send, b)
    expect(lost.sent).toHaveLength(1)
    expect(b).toMatchObject({ sent: 0, unreachable: true })
  })

  it("lets a stop through, with what was sent before it", async () => {
    const h = home([changed("kept"), new SyncStoppedError()])
    const report = emptyReport()
    await expect(sendKept(KEPT, h.send, report)).rejects.toBeInstanceOf(
      SyncStoppedError
    )
    expect(report.sent).toBe(1)
  })
})
