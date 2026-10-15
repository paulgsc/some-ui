/**
 * The shelf send's promises (LA8): one PUT per kept item, its bytes as
 * kept, no retry; home's refusals are counted and said; a 401 or no answer
 * ends it there; a stop rejects before the next item.
 */
import { describe, expect, it } from "vitest"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import type { HomeAnswer } from "@/lib/device-backend/native-http"
import type { HomeSend } from "@/lib/home-link/runtime"
import { describeSend, emptyReport, sendKept } from "@/lib/home-link/shelf"

const KEPT = [
  { activity: "topik", key: "a", body: '{ "a": 1 }' },
  { activity: "topik", key: "b", body: "[1]" },
  { activity: "leetype", key: "d", body: "{}" },
]

function home(answers: Array<HomeAnswer | Error>): {
  send: HomeSend
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
    expect(describeSend(report, "home.example", 3)).toBe(
      "Sent 3 of 3 to home.example: 1 new, 1 replaced, 1 already there."
    )
  })

  it("goes on past a full shelf and a refusal, and says both", async () => {
    const h = home([
      { status: 409, body: "" },
      { status: 422, body: "" },
      changed("kept"),
    ])
    const report = emptyReport()
    await sendKept(KEPT, h.send, report)
    expect(h.sent).toHaveLength(3)
    expect(describeSend(report, "home.example", 3)).toBe(
      "Sent 1 of 3 to home.example: 1 new, 0 replaced, 0 already there. 1 didn't fit: the TOPIK shelf on home.example is full. 1 refused by home.example."
    )
  })

  it("ends at a 401 or at no answer, and retries nothing", async () => {
    const forgotten = home([changed("kept"), { status: 401, body: "" }])
    const a = emptyReport()
    await sendKept(KEPT, forgotten.send, a)
    expect(forgotten.sent).toHaveLength(2)
    expect(describeSend(a, "home.example", 3)).toContain(
      "home.example no longer knows this phone"
    )

    const lost = home([new Error("timeout")])
    const b = emptyReport()
    await sendKept(KEPT, lost.send, b)
    expect(lost.sent).toHaveLength(1)
    expect(describeSend(b, "home.example", 3)).toBe(
      "Couldn't reach home.example. Are you on the home network? Nothing was sent."
    )
  })

  it("says what home answered before the connection was lost", async () => {
    const h = home([{ status: 409, body: "" }, new Error("timeout")])
    const report = emptyReport()
    await sendKept(KEPT, h.send, report)
    expect(describeSend(report, "home.example", 3)).toBe(
      "Sent 0 of 3 to home.example: 0 new, 0 replaced, 0 already there. 1 didn't fit: the TOPIK shelf on home.example is full. Lost home.example there, so nothing more was sent."
    )
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
