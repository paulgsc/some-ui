/**
 * @vitest-environment node
 *
 * Studio › Renders reads again on its own only while home has something under
 * way, and not once a read found no answer (AW1): away from home a timed read
 * waits for the screen to open again or a pull.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import { rendersAgainIn, WHILE_UNDER_WAY_MS } from "@/lib/renders"
import { readBoard } from "@/lib/renders/model"

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
    expect(rendersAgainIn({ status: "success", data: UNDER_WAY })).toBe(
      WHILE_UNDER_WAY_MS
    )
  })

  it("stops once a read found no answer, and when nothing is under way", () => {
    expect(rendersAgainIn({ status: "error", data: UNDER_WAY })).toBe(false)
    expect(rendersAgainIn({ status: "success", data: IDLE })).toBe(false)
  })
})
