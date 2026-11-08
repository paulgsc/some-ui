/**
 * @vitest-environment node
 *
 * Where the phone keeps each feed's videos: a week of the call where it was
 * kept before Playoff Delta came, so a video already on the phone still
 * reads as ready, and Playoff Delta's apart from it.
 */
import { describe, expect, it } from "vitest"

import { cachePath, DIR } from "@/lib/call-videos/files"

describe("cachePath", () => {
  it("keeps the call's name, and names Playoff Delta's for its feed", () => {
    expect(cachePath("call", "2026-10-30")).toBe(`${DIR}/2026-10-30.mp4`)
    expect(cachePath("playoff-delta", "2026-SF-08")).toBe(
      `${DIR}/playoff-delta-2026-SF-08.mp4`
    )
    expect(cachePath("call", "2026-10-30")).not.toBe(
      cachePath("playoff-delta", "2026-10-30")
    )
  })
})
