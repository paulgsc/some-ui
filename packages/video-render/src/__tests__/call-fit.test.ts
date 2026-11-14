/**
 * CF1 (promise, #2918): a week a captioned template draws that
 * `parseCallWeek` accepts has no scene the stage's frame overflows. These
 * hold the model's own rules (`call-fit.ts`); that the model never says a
 * scene is shorter than the stage draws it is held where the stage is drawn,
 * `apps/www/tests/ui-fit/call-fit.spec.ts`.
 *
 * The week of 2026-11-06, which home refused to render every hour, is read
 * from `paulgsc/testing` at the commit that added it, since data lives there
 * and not here. Without a network it is skipped locally and fails under CI.
 */

import { sampleWeek } from "@video-render/__tests__/sample-week"
import { callShown, CallWeekSchema, parseCallWeek } from "@video-render/call"
import type { CallWeek } from "@video-render/call"
import {
  CALL_BODY,
  CALL_LATER_SHOWN_MOST,
  CALL_PULLS_MOST,
  callFit,
  linesOf,
} from "@video-render/call-fit"
import { beforeAll, describe, expect, it } from "vitest"

const NOV_6 =
  "https://raw.githubusercontent.com/paulgsc/testing/85b89d83a67eff2ffd04c7198afd06e7b9c6d692/call/2026-11-06.json"

let nov6: CallWeek | null = null

beforeAll(async () => {
  try {
    const response = await fetch(NOV_6)
    if (!response.ok) throw new Error(`${NOV_6}: ${String(response.status)}`)
    nov6 = CallWeekSchema.parse(await response.json())
  } catch (error) {
    // Under CI an unread week is a failure, never a skip that proved nothing.
    if (process.env["CI"]) throw error
  }
}, 60_000)

/** A copy of `week` changed by `change`, read back against the schema. */
function edited(week: CallWeek, change: (draft: CallWeek) => void): CallWeek {
  const draft = structuredClone<CallWeek>(week)
  change(draft)
  return CallWeekSchema.parse(draft)
}

const pull = (i: number): CallWeek["done"][number]["pulls"][number] => ({
  repo: "some-ui",
  kind: "pr",
  number: 9000 + i,
  title: "The render worker obeys the lane, and resumes from its kept steps",
  change: "story",
})

describe("the week of 2026-11-06 (#2918)", () => {
  it("is refused for the two asks that can't fit, and says what to shorten", (context) => {
    if (nov6 === null) return context.skip()
    const parsed = parseCallWeek(nov6)
    expect(parsed.ok).toBe(false)
    const problems = parsed.ok ? [] : parsed.problems
    expect(problems).toHaveLength(2)
    expect(problems[0]).toMatch(/^asks-2 \(ask-2860\): .*shorten its question/)
    expect(problems[1]).toMatch(/^asks-4 \(ask-2627\): .*shorten its question/)
  })

  it("counts down the lists that overflowed: the board, the batches and the close", (context) => {
    if (nov6 === null) return context.skip()
    const week = nov6
    const { shown, heights } = callFit(week)
    expect(shown.board).toBeLessThan(week.board.rows.length)
    expect(shown.later).toBeLessThan(CALL_LATER_SHOWN_MOST)
    for (const batch of week.done.slice(0, 7))
      expect(shown.pulls[batch.id]).toBeLessThan(CALL_PULLS_MOST)
    for (const id of [
      "board",
      "close",
      ...week.done.map((_, i) => `done-${i + 1}`),
    ])
      expect(heights[id], id).toBeLessThanOrEqual(CALL_BODY.height)
  })

  it("renders once those two asks are shortened", (context) => {
    if (nov6 === null) return context.skip()
    const week = edited(nov6, (w) => {
      const [, second, , fourth] = w.asks
      if (second === undefined || fourth === undefined) throw new Error("asks")
      second.question =
        "Should Korean practice share one drama world, each scene standing alone?"
      fourth.question =
        "How should the Show level filter treat a level TOPIK keeps?"
      fourth.whyYours =
        "One tap to look would hold that level for good. Whether a look counts as a choice is your call."
    })
    expect(parseCallWeek(week)).toMatchObject({ ok: true })
  })
})

describe("the captioned frame (version 2 on)", () => {
  it("holds every scene of the sample week", () => {
    const { problems, heights } = callFit(sampleWeek())
    expect(problems).toEqual([])
    for (const [id, h] of Object.entries(heights))
      expect(h, id).toBeLessThanOrEqual(CALL_BODY.height)
  })

  it("shows as much of a long list as fits, and counts the rest", () => {
    const week = edited(sampleWeek(), (w) => {
      w.board.rows = Array.from({ length: 60 }, (_, i) => ({
        ledger: `row-${i}`,
        title: "Studio takes on a conveyor",
        status: "open" as const,
        waitsOnYou: 0,
      }))
      const [first] = w.done
      if (first === undefined) throw new Error("done")
      first.pulls = [
        ...first.pulls,
        ...Array.from({ length: 30 }, (_, i) => pull(i)),
      ]
      w.later = Array.from({ length: 40 }, (_, i) => ({
        id: `later-${i}`,
        question: "Run home's deploy once more, for the Renders board",
        refs: [
          { repo: "server" as const, kind: "issue" as const, number: i + 1 },
        ],
      }))
    })
    expect(parseCallWeek(week)).toMatchObject({ ok: true })
    const { shown, heights } = callFit(week)
    expect(shown.board).toBeGreaterThan(0)
    expect(shown.board).toBeLessThan(60)
    expect(shown.pulls[week.done[0]?.id ?? ""]).toBeLessThanOrEqual(
      CALL_PULLS_MOST
    )
    expect(shown.later).toBeGreaterThan(0)
    for (const id of ["board", "done-1", "close"])
      expect(heights[id], id).toBeLessThanOrEqual(CALL_BODY.height)
  })

  it("refuses words no count can shorten, naming the scene and the item", () => {
    const week = edited(sampleWeek(), (w) => {
      const [ask] = w.asks
      if (ask === undefined) throw new Error("asks")
      ask.whyYours = "Only you can say which of these matters more. ".repeat(12)
    })
    const parsed = parseCallWeek(week)
    expect(parsed.ok).toBe(false)
    expect(parsed.ok ? [] : parsed.problems).toEqual([
      expect.stringMatching(
        /^asks-1 \(.+\): its words run past the frame by about \d+ lines; shorten its question, why it's yours/
      ),
    ])
  })
})

describe("a version 1 week, with no caption band", () => {
  const v1 = (): CallWeek =>
    edited(sampleWeek(), (w) => {
      w.template.version = 1
      const [first] = w.done
      if (first === undefined) throw new Error("done")
      first.pulls = [
        ...first.pulls,
        ...Array.from({ length: 30 }, (_, i) => pull(i)),
      ]
      const [ask] = w.asks
      if (ask === undefined) throw new Error("asks")
      ask.whyYours = "Only you can say which of these matters more. ".repeat(12)
    })

  it("is drawn as it always was: ten pulls a batch, six later asks, every row", () => {
    const week = v1()
    const shown = callShown(week)
    expect(shown.pulls[week.done[0]?.id ?? ""]).toBe(CALL_PULLS_MOST)
    expect(shown.board).toBe(week.board.rows.length)
    expect(shown.later).toBe(Math.min(week.later.length, CALL_LATER_SHOWN_MOST))
  })

  it("is not held to the captioned frame", () => {
    expect(parseCallWeek(v1())).toMatchObject({ ok: true })
  })
})

describe("how words wrap", () => {
  it("keeps short words on one line, and wraps what runs past it", () => {
    expect(
      linesOf([{ text: "Home is mine", face: "prose", em: 1 }], 1825)
    ).toBe(1)
    expect(
      linesOf(
        [{ text: "Home is mine ".repeat(20), face: "prose", em: 1 }],
        1825
      )
    ).toBeGreaterThan(1)
  })

  it("breaks a word wider than a line across lines", () => {
    expect(
      linesOf([{ text: "x".repeat(400), face: "mono", em: 1 }], 1825)
    ).toBe(Math.ceil((400 * 0.61 * 28.8) / 1825))
  })
})
