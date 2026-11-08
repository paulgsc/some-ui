/**
 * @vitest-environment node
 *
 * Everything Studio › Renders says is in the person's terms (CLAUDE.md, "State
 * in the person's terms"): no job, lane, state name or code, and an estimate
 * that never reads as exact or finished.
 */
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import type {
  Board,
  HeldBy,
  Now,
  Phase,
  RenderFailed,
} from "@/lib/renders/model"
import {
  dayOf,
  episodeName,
  failedLine,
  liveLine,
  nowLines,
  RENDERS_WORDS,
  roughly,
} from "@/lib/renders/words"

function strings(value: unknown): Array<string> {
  if (typeof value === "string") return [value]
  if (typeof value === "function") return []
  if (typeof value === "object" && value !== null)
    return Object.values(value).flatMap(strings)
  return []
}

const PHASES: ReadonlyArray<Phase> = [
  "waiting",
  "rendering",
  "paused",
  "finishing",
]
const HELD: ReadonlyArray<HeldBy | null> = [
  "busy",
  "memory",
  "pressure",
  "settling",
  "unknown",
  "clear",
  "silent",
  null,
]

const now = (
  state: Phase,
  heldBy: HeldBy | null,
  estimate: Now["estimate"],
  stuck = false
): Now => ({
  feed: "call",
  key: "2026-11-06",
  state,
  since: 0,
  stateSince: 0,
  gaveWay: 2,
  heldBy,
  stuck,
  estimate,
})

const everyNow = PHASES.flatMap((state) =>
  HELD.flatMap((held) =>
    [
      null,
      { share: 0.4, secondsLeft: 600 },
      { share: 0.95, secondsLeft: null },
    ].flatMap((estimate) => [
      now(state, held, estimate),
      now(state, held, estimate, true),
    ])
  )
)

const board = (n: Now | null): Board => ({
  now: n,
  waiting: [],
  failed: [],
  done: [],
  coming: [],
})

describe("RENDERS_WORDS and what it says of each render", () => {
  it("names no machinery, in any state", () => {
    const said = [
      ...strings(RENDERS_WORDS),
      RENDERS_WORDS.expected("2026-11-13"),
      RENDERS_WORDS.gaveWay(1),
      RENDERS_WORDS.gaveWay(3),
      ...everyNow.flatMap((n) => strings(nowLines(n))),
      ...everyNow.map((n) => liveLine(board(n))),
      ...(["recorder", "home"] as const).map((by) =>
        failedLine({
          feed: "call",
          key: "2026-10-30",
          at: 0,
          by,
          exit: 1,
        } satisfies RenderFailed)
      ),
    ]
    for (const line of said) expect(line, line).not.toMatch(MACHINERY)
  })

  it("never says it has finished before it has", () => {
    for (const n of everyNow.filter((n) => n.state !== "finishing")) {
      const lines = nowLines(n)
      expect(lines.percent === null || lines.percent <= 95, lines.title).toBe(
        true
      )
    }
  })

  it("says time left roughly, and only while it renders", () => {
    expect(roughly(30)).toBe("about a minute")
    expect(roughly(600)).toBe("about 10 minutes")
    expect(roughly(5400)).toBe("about 2 hours")
    expect(
      nowLines(now("rendering", null, { share: 0.4, secondsLeft: 600 })).left
    ).toBe("about 10 minutes left, roughly.")
    expect(
      nowLines(now("paused", "busy", { share: 0.4, secondsLeft: 600 })).left
    ).toBeNull()
    expect(
      nowLines(now("rendering", "silent", { share: 0.4, secondsLeft: 600 }))
        .left
    ).toBeNull()
  })

  it("names an episode by its week, never its key", () => {
    expect(episodeName("preview", "preview-conference-call")).toBe("A video")
    expect(nowLines(now("rendering", null, null)).title).toBe(
      "The weekly call: 2026-11-06 to 2026-11-12"
    )
  })

  it("has a line for every board, so the line above the tiles never comes and goes", () => {
    expect(liveLine(board(now("rendering", null, null)))).toBe(
      "Making: The weekly call: 2026-11-06 to 2026-11-12."
    )
    expect(liveLine(board(null))).toBe("Home isn't making anything right now.")
    expect(
      liveLine({
        ...board(null),
        waiting: [{ feed: "call", key: "2026-11-06", at: 0 }],
      })
    ).toBe("Videos wait to be made.")
    expect(
      liveLine({
        ...board(null),
        failed: [
          { feed: "call", key: "2026-10-30", at: 0, by: "home", exit: null },
        ],
      })
    ).toBe("A video couldn't be made.")
  })

  it("reads a day home expects as a day of the week", () => {
    expect(dayOf("2026-11-13")).toBe("Friday, November 13")
  })
})
