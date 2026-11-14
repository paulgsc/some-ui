/** @vitest-environment node */
import {
  BADGE_COLOUR,
  BADGE_STATES,
  opening,
  openness,
  REVEAL,
  STATUS_BADGE_LEAD_MS,
} from "@burn-ins/lib/badge"
import type { BadgeMark } from "@burn-ins/lib/badge"
import { frameAt, prepare } from "@burn-ins/lib/burn-in"
import { LANDSCAPE, PORTRAIT } from "@burn-ins/lib/geometry"
import { INK } from "@burn-ins/lib/journal"
import { CONTRAST_FLOOR, contrastRatio } from "@some-ui/styles/theme"
import { oklchOf } from "@some-ui/styles/theme/video-palette"
import { describe, expect, it } from "vitest"

describe("which appearance of a badge spells itself out", () => {
  it("is the first of each state not shown before, and only that one", () => {
    expect(
      opening(["pr", "you", "main", "main", "you", "gap"], ["main"])
    ).toEqual([true, true, false, false, false, true])
  })

  it("is none once every state was shown earlier in the video", () => {
    expect(opening(["gap", "pr"], BADGE_STATES)).toEqual([false, false])
  })
})

describe("how far a revealing badge is open", () => {
  it.each([
    [-1, 0],
    [0, 0],
    [REVEAL.inMs / 2, 0.5],
    [REVEAL.inMs, 1],
    [1300, 1],
    [REVEAL.totalMs - REVEAL.outMs, 1],
    [REVEAL.totalMs - REVEAL.outMs / 2, 0.5],
    [REVEAL.totalMs, 0],
    [10_000, 0],
  ])("%d ms after it appears: %d", (ms, open) => {
    expect(openness(ms)).toBeCloseTo(open, 6)
  })
})

describe("the status badge over a scene", () => {
  const at = (params: unknown, t: number): ReadonlyArray<BadgeMark> => {
    const p = prepare(
      { kind: "status-badge", design: "badge-v1", params },
      PORTRAIT
    )
    if (!p.ok) throw new Error(p.problems.join("; "))
    const f = frameAt(p.value, t)
    if (f.kind !== "status-badge") throw new Error(f.kind)
    return f.frame.marks
  }
  const held = STATUS_BADGE_LEAD_MS + 1300

  it("appears after the scene's way in, then spells itself out when its state is new to the video", () => {
    expect(at({ badge: "pr" }, STATUS_BADGE_LEAD_MS - 1)).toEqual([])
    const open = at({ badge: "pr" }, held)[0]?.open
    expect(open?.amount).toBe(1)
    expect(open?.label.rows).toEqual(["open PR · may change"])
    expect(
      at({ badge: "pr" }, STATUS_BADGE_LEAD_MS + REVEAL.totalMs)[0]?.open
    ).toBeNull()
  })

  it("shows the glyph alone when its state was shown earlier in the video", () => {
    expect(at({ badge: "pr", badgesSeen: ["pr"] }, held)[0]?.open).toBeNull()
  })

  it("refuses a state it has no glyph for", () => {
    const p = prepare(
      { kind: "status-badge", design: "badge-v1", params: { badge: "done" } },
      LANDSCAPE
    )
    expect(p.ok).toBe(false)
  })
})

describe("the badges' colours", () => {
  it("read as text on the card panel and on the ground", () => {
    for (const state of BADGE_STATES) {
      for (const ground of [INK.panel, INK.ground]) {
        expect(
          contrastRatio(oklchOf(BADGE_COLOUR[state]), oklchOf(ground)),
          `${state} on ${ground}`
        ).toBeGreaterThanOrEqual(CONTRAST_FLOOR.text)
      }
    }
  })
})
