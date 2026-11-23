/**
 * @vitest-environment node
 *
 * The episode page reads its feed's list again on its own while a file is on
 * the line (ASSETS-R; the owner, 2026-11-22), as Studio › Renders reads its
 * board: every `WHILE_UNDER_WAY_MS`, never while nothing moves.
 */
import { describe, expect, it } from "vitest"

import { listAgainIn } from "@/lib/call-videos"
import { WHILE_UNDER_WAY_MS } from "@/lib/renders/model"

describe("listAgainIn", () => {
  it("reads every half minute while something is under way, never otherwise", () => {
    expect(listAgainIn(true)).toBe(WHILE_UNDER_WAY_MS)
    expect(listAgainIn(false)).toBe(false)
  })
})
