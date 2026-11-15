/** @vitest-environment node */
import { describe, expect, it } from "vitest"

import { cachePath, DIR } from "@/lib/call-videos/files"

describe("cachePath", () => {
  it("keeps the call's name, and names Playoff Delta's, the cards essays' and the previews' for their owner", () => {
    expect(cachePath("call", "2026-10-30")).toBe(`${DIR}/2026-10-30.mp4`)
    expect(cachePath("playoff-delta", "2026-SF-08")).toBe(
      `${DIR}/playoff-delta-2026-SF-08.mp4`
    )
    // One copy of an essay, whether Renders' page or its episode brought it.
    expect(cachePath("cards-essay", "zfs-2026-11-02")).toBe(
      `${DIR}/cards-essay-zfs-2026-11-02.mp4`
    )
    expect(cachePath("preview", "conference-call-20261108T074500Z")).toBe(
      `${DIR}/preview-conference-call-20261108T074500Z.mp4`
    )
  })
})
