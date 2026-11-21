/**
 * @vitest-environment node
 *
 * Home's answers on asking it to hear a take again (#3339), as Takes and
 * Needs your attention read them: an ask's answer, and each take's word on
 * whether home hears it again.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import { HearAgainSchema, readHearAgain } from "@/lib/hear-again/model"
import { readTakes } from "@/lib/take-library/model"
import { readAttention } from "@/lib/take-reconcile/model"

const reply = (status: number, body: unknown = ""): HomeAnswer => ({
  status,
  body: typeof body === "string" ? body : JSON.stringify(body),
})

const AT = "2026-11-21T15:00:00.000Z"

describe("asking home to hear a take again (#3339)", () => {
  it("reads an ask as asked or asked too recently, each with when it can next be asked", () => {
    for (const status of [200, 201]) {
      expect(readHearAgain(reply(status, { askAgainAt: AT }))).toEqual({
        kind: "asked",
        askAgainAt: AT,
      })
    }
    expect(readHearAgain(reply(429, { askAgainAt: AT }))).toEqual({
      kind: "snoozed",
      askAgainAt: AT,
    })
    // A time home doesn't name, or a body it can't read, is none.
    expect(readHearAgain(reply(429, "{"))).toEqual({
      kind: "snoozed",
      askAgainAt: null,
    })
    expect(readHearAgain(reply(201, { askAgainAt: "soon" }))).toEqual({
      kind: "asked",
      askAgainAt: null,
    })
  })

  it("reads a take home doesn't hold, or hears nothing more in, as settled, and anything else as nothing changed", () => {
    expect(readHearAgain(reply(404))).toEqual({ kind: "settled" })
    expect(readHearAgain(reply(409))).toEqual({ kind: "settled" })
    for (const status of [401, 422, 500]) {
      expect(readHearAgain(reply(status))).toEqual({ kind: "notTaken" })
    }
  })

  it("reads whether home hears a take again, and a home before it as one that doesn't", () => {
    expect(HearAgainSchema.parse({ askAgainAt: AT, hearing: false })).toEqual({
      askAgainAt: AT,
      hearing: false,
    })
    expect(HearAgainSchema.parse({ askAgainAt: null, hearing: true })).toEqual({
      askAgainAt: null,
      hearing: true,
    })
    for (const said of [undefined, null, { askAgainAt: AT }, "yes"]) {
      expect(HearAgainSchema.parse(said)).toBeNull()
    }
  })

  it("carries it on each take of both reads", () => {
    const hearAgain = { askAgainAt: null, hearing: false }
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
            hearAgain,
          },
        ],
        total: 1,
      })
    )
    expect(
      attention.kind === "read" && attention.page.takes[0]?.hearAgain
    ).toEqual(hearAgain)
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
            hearAgain,
          },
        ],
        total: 1,
        matched: null,
        by: "newest",
      })
    )
    expect(takes.kind === "read" && takes.page.takes[0]?.hearAgain).toEqual(
      hearAgain
    )
  })
})
