/**
 * @vitest-environment node
 *
 * Studio › Renders reads again on its own only while home has something under
 * way, and not once home gave no answer (AW1): a pull or Try again reads
 * again.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import { rendersAgainIn, WHILE_UNDER_WAY_MS } from "@/lib/renders"
import { readBoard } from "@/lib/renders/model"
import { RendersUnanswered } from "@/lib/renders/read"

const answer = (now: unknown): HomeAnswer => ({
  status: 200,
  body: JSON.stringify({ now, waiting: [], failed: [], done: [], coming: [] }),
})

const UNDER_WAY = readBoard(
  answer({
    feed: "call",
    key: "2026-11-06",
    state: "rendering",
    since: 1794130000,
    stateSince: 1794139140,
    gaveWay: 0,
    heldBy: null,
    stuck: false,
    estimate: null,
  })
)
const IDLE = readBoard(answer(null))
if (UNDER_WAY.kind !== "read" || IDLE.kind !== "read") {
  throw new Error("the fixtures no longer read")
}

describe("Renders' read on its own (AW1)", () => {
  it("asks again every half minute while home has something under way", () => {
    expect(rendersAgainIn({ error: null, data: UNDER_WAY })).toBe(
      WHILE_UNDER_WAY_MS
    )
  })

  it("keeps asking after a read the busy link or an unreadable answer failed", () => {
    expect(rendersAgainIn({ error: new Error("busy"), data: UNDER_WAY })).toBe(
      WHILE_UNDER_WAY_MS
    )
  })

  it("stops once home gave no answer, and when nothing is under way", () => {
    expect(
      rendersAgainIn({ error: new RendersUnanswered("x"), data: UNDER_WAY })
    ).toBe(false)
    expect(rendersAgainIn({ error: null, data: IDLE })).toBe(false)
  })
})
