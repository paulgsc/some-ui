/** @vitest-environment node */
import { AT, run, started } from "@soundbites/lib/project/__tests__/fixture"
import type { TimeEvent } from "@soundbites/lib/studio/time-log"
import {
  SITTING_GAP_MS,
  sittingKey,
  timePerScreen,
  timeView,
} from "@soundbites/lib/studio/time-log"
import { historyView } from "@soundbites/lib/studio/view"
import { describe, expect, it } from "vitest"

const T0 = Date.UTC(2026, 9, 30, 10)

/** Events of one sitting, `s`, at `seconds` after T0. */
function log(
  ...entries: ReadonlyArray<[number, TimeEvent["type"], string?]>
): Array<TimeEvent> {
  return entries.map(([seconds, type, screen], i) => ({
    id: `e${i}`,
    at: new Date(T0 + seconds * 1_000).toISOString(),
    sitting: "s",
    kind: "record",
    type,
    screen: screen ?? null,
  }))
}

describe("time per screen", () => {
  it("counts each screen from entered to left", () => {
    const totals = timePerScreen(
      log(
        [0, "sitting_opened"],
        [0, "screen_entered", "record:a"],
        [40, "screen_left", "record:a"],
        [40, "screen_entered", "record:b"],
        [100, "screen_left", "record:b"],
        [100, "sitting_closed"]
      )
    )
    expect(Object.fromEntries(totals)).toEqual({
      "record:a": 40_000,
      "record:b": 60_000,
    })
  })

  it("counts nothing while the page is hidden", () => {
    const totals = timePerScreen(
      log(
        [0, "sitting_opened"],
        [0, "screen_entered", "record:a"],
        [10, "page_hidden"],
        [300, "page_shown"],
        [320, "screen_left", "record:a"]
      )
    )
    expect(totals.get("record:a")).toBe(30_000)
  })

  it("counts nothing across a gap longer than a sitting's", () => {
    const gap = SITTING_GAP_MS / 1_000 + 1
    const totals = timePerScreen(
      log(
        [0, "sitting_opened"],
        [0, "screen_entered", "record:a"],
        [20, "screen_left", "record:a"],
        [20, "screen_entered", "record:b"],
        [20 + gap, "screen_left", "record:b"]
      )
    )
    expect(Object.fromEntries(totals)).toEqual({ "record:a": 20_000 })
  })

  it("counts a sitting left open up to its last event", () => {
    const totals = timePerScreen(
      log(
        [0, "sitting_opened"],
        [0, "screen_entered", "record:a"],
        [15, "page_hidden"]
      )
    )
    expect(totals.get("record:a")).toBe(15_000)
  })

  it("names a sitting within home's limits", () => {
    expect(sittingKey({ id: "s3", openedAt: "2026-10-30T10:00:05.000Z" })).toBe(
      "s3-20261030T100005000Z"
    )
  })
})

describe("Start's quiet links (ST4)", () => {
  it("Time spent names each screen in words, this video's sittings only, most first", () => {
    const { project } = run(started(), {
      type: "sittingOpened",
      id: "s1",
      at: AT,
    })
    const [sitting] = project.sittings
    if (sitting === undefined) throw new Error("no sitting")
    const mine = log(
      [0, "screen_entered", "start"],
      [60, "screen_left", "start"],
      [60, "screen_entered", "record:b"],
      [240, "screen_left", "record:b"],
      [240, "screen_entered", "record:gone"],
      [300, "screen_left", "record:gone"]
    ).map((event) => ({ ...event, sitting: sittingKey(sitting) }))
    const theirs = log(
      [0, "screen_entered", "start"],
      [999, "screen_left", "start"]
    )
    expect(timeView(project, [...mine, ...theirs])).toEqual([
      { name: "Scene 2", ms: 180_000 },
      { name: "Start", ms: 60_000 },
      { name: "A scene since dropped", ms: 60_000 },
    ])
  })

  it("History lists every version, newest first, with who made it", () => {
    const { project } = run(started(), {
      type: "revised",
      author: "owner",
      message: "Shape: Calm look, Read voice",
      at: AT,
      cutList: started().project.revisions[0]!.cutList,
    })
    expect(
      historyView(project).map((row) => [row.rev, row.who, row.message])
    ).toEqual([
      [2, "You", "Shape: Calm look, Read voice"],
      [1, "Claude", "First cut"],
    ])
  })
})
