/**
 * @vitest-environment node
 *
 * Home's answers on asking it to hear a take again (#3339), as Takes and
 * Needs your attention read them: an ask's answer, and each take's word on
 * whether home hears it again; and the port, over the link's answers.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { afterEach, describe, expect, it, vi } from "vitest"

import { hearAgainHome } from "@/lib/hear-again"
import { HearAgainSchema, readHearAgain } from "@/lib/hear-again/model"
import type { Asked } from "@/lib/home-link/while-busy"
import { readTakes } from "@/lib/take-library/model"
import { readAttention } from "@/lib/take-reconcile/model"

const asked = vi.hoisted((): { next: Array<Asked> } => ({ next: [] }))

vi.mock("@/lib/home-link/attention", () => ({
  askHearAgain: (): Promise<Asked> =>
    Promise.resolve(asked.next.shift() ?? { kind: "unreachable" }),
}))

afterEach(() => {
  asked.next = []
})

const reply = (status: number, body: unknown = ""): HomeAnswer => ({
  status,
  body: typeof body === "string" ? body : JSON.stringify(body),
})

const AT = "2026-11-21T15:00:00.000Z"
const READ = { open: true, hearing: false, askedAt: null, nextAt: null }

describe("asking home to hear a take again (#3339)", () => {
  it("reads an ask home took as asked, a resend too", () => {
    for (const status of [200, 201]) {
      expect(
        readHearAgain(
          reply(status, { change: "recorded", act: "hear-again", verdict: {} })
        )
      ).toEqual({ kind: "asked", askAgainAt: null })
    }
  })

  it("reads home's snooze, with when it can next be asked, apart from a take not heard a first time", () => {
    expect(
      readHearAgain(
        reply(409, {
          error: { code: "conflict", details: { nextAt: [AT] } },
        })
      )
    ).toEqual({ kind: "snoozed", askAgainAt: AT })
    expect(readHearAgain(reply(409, { error: { code: "conflict" } }))).toEqual({
      kind: "waiting",
    })
    expect(readHearAgain(reply(409, "{"))).toEqual({ kind: "waiting" })
  })

  it("reads a take home doesn't hold as settled, and anything else as nothing changed", () => {
    expect(readHearAgain(reply(404))).toEqual({ kind: "settled" })
    for (const status of [401, 422, 429, 500]) {
      expect(readHearAgain(reply(status))).toEqual({ kind: "notTaken" })
    }
  })

  it("reads whether home hears a take again, and none where it can't be read", () => {
    expect(HearAgainSchema.parse(READ)).toEqual({
      open: true,
      hearing: false,
      askAgainAt: null,
    })
    expect(
      HearAgainSchema.parse({ ...READ, open: false, askedAt: AT, nextAt: AT })
    ).toEqual({ open: false, hearing: false, askAgainAt: AT })
    // A home before it, a shape this phone can't read, or a time it can't:
    // none offered, never a take that reads as free to ask.
    for (const said of [
      undefined,
      null,
      "yes",
      { open: true },
      { ...READ, open: false, nextAt: "tomorrow" },
      { ...READ, open: false, nextAt: "2026-11-21T15:00:00" },
    ]) {
      expect(HearAgainSchema.parse(said)).toBeNull()
    }
  })

  it("carries it on each take of both reads", () => {
    const attention = readAttention(
      reply(200, {
        takes: [
          {
            id: "t1",
            of: "studio",
            ref: "spoken:sca.0",
            recordedAt: AT,
            heard: null,
            verdict: {
              kind: "failed",
              reasons: [],
              rule: "heard-1",
              signals: null,
            },
            hearAgain: READ,
          },
        ],
        total: 1,
      })
    )
    const said = { open: true, hearing: false, askAgainAt: null }
    expect(
      attention.kind === "read" && attention.page.takes[0]?.hearAgain
    ).toEqual(said)
    const takes = readTakes(
      reply(200, {
        takes: [
          {
            id: "t1",
            kind: "studio",
            ref: "spoken:sca.0",
            recordedAt: AT,
            storedAt: AT,
            size: 1,
            setAsideAt: null,
            heard: null,
            hearAgain: READ,
          },
        ],
        total: 1,
        matched: null,
        by: "newest",
      })
    )
    expect(takes.kind === "read" && takes.page.takes[0]?.hearAgain).toEqual(
      said
    )
  })

  it("says an ask the link couldn't send changed nothing, and one it stayed busy for so", async () => {
    asked.next = [{ kind: "unreachable" }]
    expect(await hearAgainHome("t1")).toEqual({ kind: "notTaken" })
    asked.next = [{ kind: "unpaired" }]
    expect(await hearAgainHome("t1")).toEqual({ kind: "notTaken" })
    asked.next = [{ kind: "answered", answer: reply(201) }]
    expect(await hearAgainHome("t1")).toEqual({
      kind: "asked",
      askAgainAt: null,
    })
  })
})
