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
import { subjectOf } from "@/lib/renders/subject"
import {
  dayOf,
  doneLine,
  failedLine,
  kindName,
  liveLine,
  nowLines,
  openWords,
  renderName,
  RENDERS_WORDS,
  renderShape,
  roughly,
  SHAPE_WORDS,
  thingName,
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

/** A row of every kind home's board holds, from either home (#2899). */
const ROWS = [
  { feed: "call", key: "2026-11-06" },
  { feed: "playoff-delta", key: "2026-SF-09" },
  { feed: "rust-essay", key: "2026-11-02" },
  {
    feed: "preview",
    key: "conference-call-20261112T024837Z",
    template: "conference-call",
  },
  { feed: "preview", key: "conference-call-20261112T024837Z" },
  { feed: "preview", key: "a-template-from-later-20261112T024837Z" },
  { feed: "clip-walk", key: "tray-fix-after" },
  { feed: "a-kind-from-later", key: "x" },
] as const

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
      ...strings(SHAPE_WORDS),
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
      ...ROWS.flatMap((row) => {
        const subject = subjectOf(row)
        return [
          renderName(row),
          kindName(subject),
          thingName(subject),
          openWords(subject) ?? "",
          failedLine({ ...row, at: 0, by: "recorder", exit: 1 }),
          failedLine({
            ...row,
            at: 0,
            by: "home",
            exit: null,
            reason: "no-sample",
          }),
          doneLine(
            { ...row, at: 1_762_588_000, expiresAt: 1_762_674_400 },
            "UTC"
          ) ?? "",
        ]
      }),
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

  it("comes to one shape at a glance, for Settings › Status (SFEED13)", () => {
    expect(renderShape(board(now("rendering", null, null)))).toBe("making")
    expect(renderShape(board(now("finishing", null, null)))).toBe("making")
    expect(renderShape(board(now("paused", null, null)))).toBe("paused")
    expect(renderShape(board(now("waiting", null, null)))).toBe("waiting")
    expect(renderShape(board(null))).toBe("quiet")
    const failed = {
      ...board(null),
      failed: [
        {
          feed: "call",
          key: "2026-10-30",
          at: 0,
          by: "home" as const,
          exit: null,
        },
      ],
    }
    expect(renderShape(failed)).toBe("failed")
    // What waits says more than what failed before it.
    expect(
      renderShape({
        ...failed,
        waiting: [{ feed: "call", key: "2026-11-06", at: 0 }],
      })
    ).toBe("waiting")
  })

  it("reads a day home expects as a day of the week", () => {
    expect(dayOf("2026-11-13")).toBe("Friday, November 13")
  })

  it("names a preview by its template, from either home, never its key (#2899)", () => {
    const made = "conference-call-20261112T024837Z"
    expect(
      renderName({ feed: "preview", key: made, template: "conference-call" })
    ).toMatch(/^A preview of /)
    // A home from before the template was named: read off the key.
    expect(subjectOf({ feed: "preview", key: made })).toEqual({
      kind: "preview",
      template: "conference-call",
    })
    // The longest template that fits, where one id begins another.
    expect(
      subjectOf({ feed: "preview", key: "playoff-delta-week-20261112T024837Z" })
    ).toEqual({ kind: "preview", template: "playoff-delta-week" })
    expect(subjectOf({ feed: "preview", key: "nothing-known-1" })).toEqual({
      kind: "preview",
      template: null,
    })
    for (const line of [renderName({ feed: "preview", key: made })])
      expect(line).not.toContain("2026")
  })

  it("opens every row that has a page, and only those (#2899)", () => {
    expect(subjectOf({ feed: "call", key: "2026-11-06" })).toEqual({
      kind: "episode",
      feed: "call",
      key: "2026-11-06",
    })
    expect(subjectOf({ feed: "clip-walk", key: "tray-fix-after" })).toEqual({
      kind: "walk",
      clip: "tray-fix",
      side: "after",
    })
    expect(subjectOf({ feed: "clip-walk", key: "-after" })).toEqual({
      kind: "other",
    })
    expect(openWords({ kind: "other" })).toBeNull()
    expect(openWords({ kind: "preview", template: null })).toBeNull()
    expect(
      openWords({ kind: "preview", template: "rust-essay" })
    ).not.toBeNull()
  })

  it("says what a preview that couldn't be made needs, and that it isn't tried again", () => {
    const failed: RenderFailed = {
      feed: "preview",
      key: "rust-essay-1",
      template: "rust-essay",
      at: 0,
      by: "recorder",
      exit: 1,
    }
    expect(failedLine({ ...failed, reason: "no-sample" })).toMatch(/no sample/)
    expect(failedLine(failed)).toMatch(/Make another/)
  })

  it("says when home lets a finished preview go, and nothing under an episode", () => {
    expect(
      doneLine(
        {
          feed: "preview",
          key: "k",
          at: 1_762_588_000,
          expiresAt: 1_762_674_400,
        },
        "UTC"
      )
    ).toBe("Made Sat 7:46 AM. Home lets it go Sun 7:46 AM.")
    expect(doneLine({ feed: "call", key: "2026-11-06", at: 0 })).toBeNull()
  })
})
