/**
 * @vitest-environment node
 *
 * Everything Studio › Renders says is in the person's terms (CLAUDE.md, "State
 * in the person's terms"): no job, lane, state name or code, and an estimate
 * that never reads as exact or finished.
 */
import { describe, expect, it } from "vitest"

import { dayOf } from "@/lib/cards-essay-key"
import { FEEDS } from "@/lib/feeds"
import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import type {
  Board,
  HeldBy,
  Now,
  Phase,
  RenderFailed,
} from "@/lib/renders/model"
import { readBoard } from "@/lib/renders/model"
import { subjectOf } from "@/lib/renders/subject"
import {
  doneLine,
  failedLine,
  kindName,
  liveLine,
  minutesSaid,
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
  { feed: "cards-essay", key: "rust-scratchpad-2026-11-14" },
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
      feed: "clip-walk",
    })
    expect(
      subjectOf({ feed: "cards-essay", key: "rust-scratchpad-2026-11-14" })
    ).toEqual({ kind: "essay", key: "rust-scratchpad-2026-11-14" })
    // A key that isn't an essay's names no page: not its shape, a day the
    // calendar lacks, or longer than home keeps.
    for (const key of ["x", "x-2026-02-31", `${"a".repeat(120)}-2026-11-14`])
      expect(subjectOf({ feed: "cards-essay", key })).toEqual({
        kind: "other",
        feed: "cards-essay",
      })
    expect(
      thingName({ kind: "essay", key: "rust-scratchpad-2026-11-14" })
    ).toBe("Rust scratchpad, as of Saturday, November 14")
    expect(openWords({ kind: "other", feed: "new-feed" })).toBeNull()
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

/**
 * RNR1: a failed row the render policy refused says what it was refused for
 * and that home leaves it as it is, and every other row says what it said
 * before. Family: every reason (too-long, too-large, overflow, another,
 * none) × its numbers (both, one, none: a home from before contract epoch
 * 15 sends none, or before 16 (server#977) for overflow; and each other
 * reason's)
 * × every kind of row (each feed, something else) × who failed (recorder,
 * home), each read through the board's own reader.
 */
describe("RNR1: a refusal says why, and an older home's row reads as before", () => {
  // Every feed the phone knows, so the next one is never missed, and one it
  // doesn't (#3235).
  const ROW_FEEDS = [...FEEDS, "something-new"] as const
  const REASONS = [
    "too-long",
    "too-large",
    "overflow",
    "render",
    undefined,
  ] as const
  const NUMBERS: Readonly<Record<Refused, Record<string, unknown>>> = {
    "too-long": { minutes: 31.2, capMinutes: 30 },
    "too-large": { mb: 512, capMb: 500 },
    overflow: { scenes: ["dive-2", "beside-2", "dive-3"], sceneCount: 5 },
  }
  type Refused = "too-long" | "too-large" | "overflow"
  const refused = (reason: unknown): reason is Refused =>
    reason === "too-long" || reason === "too-large" || reason === "overflow"
  const BEFORE = {
    recorder:
      "It couldn't be made this time. Home tries again in an hour, and keeps what it had finished.",
    home: "Home couldn't keep its files. It tries again in an hour.",
  } as const

  function read(row: Record<string, unknown>): RenderFailed {
    const outcome = readBoard({
      status: 200,
      body: JSON.stringify({
        now: null,
        waiting: [],
        failed: [row],
        done: [],
        coming: [],
      }),
    })
    if (outcome.kind !== "read") throw new Error("the board did not read")
    const failed = outcome.board.failed.at(0)
    if (failed === undefined) throw new Error("no failed row")
    return failed
  }

  const cases = ROW_FEEDS.flatMap((feed) =>
    (["recorder", "home"] as const).flatMap((by) =>
      REASONS.flatMap((reason) => {
        const ownKey: Refused = refused(reason) ? reason : "too-long"
        const own = NUMBERS[ownKey]
        // Both of its own numbers; each one alone; none (a home from before
        // epoch 15, or 16 for overflow); and each other reason's numbers.
        const sets: ReadonlyArray<[string, Record<string, unknown>]> = [
          ["both", own],
          ...Object.entries(own).map(
            ([field, n]): [string, Record<string, unknown>] => [
              `only ${field}`,
              { [field]: n },
            ]
          ),
          ["none", {}],
          ...Object.entries(NUMBERS)
            .filter(([key]) => key !== ownKey)
            .map(([key, n]): [string, Record<string, unknown>] => [
              `crossed ${key}`,
              n,
            ]),
        ]
        return sets.map(([which, extra]) => ({
          feed,
          by,
          reason,
          which,
          row: read({
            feed,
            key: "2026-w46",
            at: 0,
            by,
            exit: by === "home" ? null : 1,
            ...(reason === undefined ? {} : { reason }),
            ...extra,
          }),
        }))
      })
    )
  )

  it("covers the whole family", () => {
    expect(cases).toHaveLength(ROW_FEEDS.length * 2 * REASONS.length * 6)
  })

  it("says a refusal with both its numbers, and today's line otherwise", () => {
    for (const c of cases) {
      const line = failedLine(c.row)
      if (!(c.which === "both" && refused(c.reason))) {
        expect(line, JSON.stringify(c)).toBe(BEFORE[c.by])
        continue
      }
      expect(line, JSON.stringify(c)).toMatch(
        /Home doesn't try it again as it is\.$/
      )
      expect(line, line).not.toMatch(/an hour/)
      expect(line, line).not.toMatch(MACHINERY)
    }
  })

  it("says the owner's case in plain words", () => {
    const essay = cases.find(
      (c) =>
        c.feed === "rust-essay" && c.reason === "too-long" && c.which === "both"
    )
    expect(essay && failedLine(essay.row)).toBe(
      "Too long to make: it would run 31.2 minutes, and Rust Rounds essays stop at 30 minutes. Home doesn't try it again as it is."
    )
    const large = cases.find(
      (c) => c.feed === "call" && c.reason === "too-large" && c.which === "both"
    )
    expect(large && failedLine(large.row)).toBe(
      "Too large to keep: it came out 2% larger than home keeps a video. Home doesn't try it again as it is."
    )
    const other = cases.find(
      (c) =>
        c.feed === "something-new" &&
        c.reason === "too-long" &&
        c.which === "both"
    )
    expect(other && failedLine(other.row)).toMatch(/videos like it stop at/)
  })

  it("names the scenes that don't fit their frame, and counts the rest (server#977)", () => {
    const line = (row: Record<string, unknown>): string =>
      failedLine(
        read({
          feed: "cards-essay",
          key: "k",
          at: 0,
          by: "recorder",
          exit: 1,
          reason: "overflow",
          ...row,
        })
      )
    expect(
      line({ scenes: ["dive-2", "beside-2", "dive-3"], sceneCount: 5 })
    ).toBe(
      "Some scenes don't fit the frame: dive-2, beside-2, dive-3 and 2 more. Home doesn't try it again as it is."
    )
    expect(line({ scenes: ["dive-2", "beside-2"], sceneCount: 2 })).toBe(
      "Some scenes don't fit the frame: dive-2, beside-2. Home doesn't try it again as it is."
    )
    expect(line({ scenes: ["dive-2"], sceneCount: 1 })).toBe(
      "dive-2 doesn't fit the frame. Home doesn't try it again as it is."
    )
    // No scene named is no refusal it can say.
    expect(line({ scenes: [], sceneCount: 3 })).toBe(
      "It couldn't be made this time. Home tries again in an hour, and keeps what it had finished."
    )
  })

  it("reads a board whose overflow fields it can't read, that row an ordinary failure", () => {
    const board = readBoard({
      status: 200,
      body: JSON.stringify({
        now: null,
        waiting: [],
        failed: [
          {
            feed: "call",
            key: "a",
            at: 0,
            by: "recorder",
            exit: 1,
            reason: "overflow",
            scenes: [""],
            sceneCount: "many",
          },
          {
            feed: "call",
            key: "b",
            at: 0,
            by: "recorder",
            exit: 1,
            reason: "too-long",
            minutes: 31.2,
            capMinutes: 30,
          },
        ],
        done: [],
        coming: [],
      }),
    })
    if (board.kind !== "read") throw new Error("the board did not read")
    const [odd, refusedRow] = board.board.failed
    expect(failedLine(odd)).toMatch(/Home tries again in an hour/)
    expect(failedLine(refusedRow)).toMatch(/^Too long to make/)
  })

  it("says why a cards essay was set aside over a spoken card's recording (WALK7)", () => {
    const row = (reason: string): RenderFailed => ({
      feed: "cards-essay",
      key: "rust-rounds-2026-11-20",
      at: 0,
      by: "home",
      exit: null,
      reason,
    })
    const missing = failedLine(row("take-missing"))
    const unheard = failedLine(row("take-unheard"))
    expect(missing).toMatch(/plays a recording home doesn't have\./)
    // A take you deleted withdraws the essay, which leaves the list
    // (paulgsc/server#1055): no row says it.
    expect(missing).not.toMatch(/deleted/)
    expect(unheard).toMatch(/^Home couldn't make out a recording/)
    for (const line of [missing, unheard])
      expect(line, line).not.toMatch(MACHINERY)
    // Only a cards essay's: another feed's unknown reason reads as before.
    expect(failedLine({ ...row("take-missing"), feed: "call" })).toMatch(
      /Home couldn't keep its files/
    )
  })

  it("never says a refused length at its cap, or a size at its cap as larger by a share", () => {
    const line = (row: Record<string, unknown>): string =>
      failedLine(
        read({
          feed: "rust-essay",
          key: "k",
          at: 0,
          by: "recorder",
          exit: 1,
          ...row,
        })
      )
    // The recorder sends tenths and whole MB, so a video just past its cap
    // can arrive at it.
    expect(line({ reason: "too-long", minutes: 30, capMinutes: 30 })).toBe(
      "Too long to make: it would run a little past 30 minutes, where Rust Rounds essays stop. Home doesn't try it again as it is."
    )
    expect(line({ reason: "too-long", minutes: 60.4, capMinutes: 60 })).toMatch(
      /a little past 1 hour,/u
    )
    for (const mb of [500, 503])
      expect(line({ reason: "too-large", mb, capMb: 500 })).toMatch(
        /came out a little larger than home keeps a video/u
      )
  })

  it("says a length and a size without a number of three digits", () => {
    expect(minutesSaid(24.44)).toBe("24.4 minutes")
    expect(minutesSaid(15)).toBe("15 minutes")
    expect(minutesSaid(1)).toBe("1 minute")
    expect(minutesSaid(60)).toBe("1 hour")
    expect(minutesSaid(112.3)).toBe("1 hour 52 minutes")
    expect(minutesSaid(150)).toBe("2 hours 30 minutes")
    for (const [mb, capMb] of [
      [500.4, 500],
      [999, 500],
      [1000, 500],
      [123_456, 500],
    ] as const) {
      const line = failedLine(
        read({
          feed: "call",
          key: "k",
          at: 0,
          by: "recorder",
          exit: 1,
          reason: "too-large",
          mb,
          capMb,
        })
      )
      expect(line, line).not.toMatch(MACHINERY)
    }
    for (const minutes of [15.1, 99.9, 100, 1234.5]) {
      const line = failedLine(
        read({
          feed: "rust-essay",
          key: "k",
          at: 0,
          by: "recorder",
          exit: 1,
          reason: "too-long",
          minutes,
          capMinutes: 15,
        })
      )
      expect(line, line).not.toMatch(MACHINERY)
    }
  })

  it("leaves a preview's words as they were", () => {
    const row = read({
      feed: "preview",
      key: "rust-essay-1",
      template: "rust-essay",
      at: 0,
      by: "recorder",
      exit: 1,
      reason: "too-long",
      minutes: 31.2,
      capMinutes: 15,
    })
    expect(failedLine(row)).toMatch(/longer than home will make/)
  })
})
