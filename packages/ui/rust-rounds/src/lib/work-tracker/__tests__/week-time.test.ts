/**
 * A week's tracked time (RR26, C677) and the tracker's words: each span
 * once, home's close standing, refused spans apart, and words in the
 * owner's terms.
 */
import type { HomeSpan } from "@rust-rounds/lib/work-tracker/home"
import type { SpanEvent } from "@rust-rounds/lib/work-tracker/record"
import { weekTime } from "@rust-rounds/lib/work-tracker/week-time"
import {
  hoursMinutes,
  runningClock,
  TRACKER_WORDS,
} from "@rust-rounds/lib/work-tracker/words"
import { describe, expect, it } from "vitest"

const week = { id: "2026-w47", tickets: [{ id: "TB-101" }, { id: "TB-102" }] }

const start = (
  id: string,
  ticket: string,
  step: "read" | "academy" | "voice"
): SpanEvent => ({
  kind: "start",
  id,
  at: "2026-11-19T09:40:00.000Z",
  week: "2026-w47",
  ticket,
  step,
  exercise: null,
  points: [1],
  device: "Pixel 8",
})
const close = (id: string, countedSeconds: number): SpanEvent => ({
  kind: "close",
  id,
  at: "2026-11-19T10:40:00.000Z",
  stoppedBy: "you",
  answer: "part",
  countedSeconds,
})
const home = (
  id: string,
  ticket: string,
  counted: number | null
): HomeSpan => ({
  id,
  week: "2026-w47",
  ticket,
  step: "academy",
  exercise: 1,
  points: [1],
  device: "Tablet",
  startedAt: "2026-11-18T09:40:00.000Z",
  keptAt: "2026-11-18T09:40:01.000Z",
  closed:
    counted === null
      ? null
      : {
          at: "2026-11-18T10:40:00.000Z",
          stoppedBy: "itself",
          answer: "part",
          countedSeconds: counted,
          keptAt: "2026-11-18T12:00:00.000Z",
        },
})

describe("the week's time", () => {
  it("counts each answered span once, by ticket and the step it started from", () => {
    const time = weekTime(
      week,
      [
        start("a", "TB-101", "read"),
        close("a", 600),
        start("b", "TB-101", "voice"),
        close("b", 1200),
        start("c", "TB-102", "read"), // still open: nothing yet
      ],
      [
        { ...home("a", "TB-101", 600), step: "read" }, // the same span as "a"
        home("d", "TB-102", 1800), // another device's
        home("e", "TB-102", null),
      ],
      () => false
    )
    expect(time.seconds).toBe(600 + 1200 + 1800)
    expect(time.spans).toBe(3)
    expect(time.tickets).toEqual([
      {
        ticket: "TB-101",
        byStep: { read: 600, academy: 0, voice: 1200 },
        seconds: 1800,
      },
      {
        ticket: "TB-102",
        byStep: { read: 0, academy: 1800, voice: 0 },
        seconds: 1800,
      },
    ])
  })

  it("keeps a span home refused out of the total, and counts it apart", () => {
    const time = weekTime(
      week,
      [start("a", "TB-101", "read"), close("a", 600)],
      [],
      (key) => key === "a/start"
    )
    expect(time).toMatchObject({ seconds: 0, spans: 0, refused: 1 })
  })

  it("leaves out other weeks' spans", () => {
    const other = { ...start("a", "TB-101", "read"), week: "2026-w46" }
    expect(weekTime(week, [other, close("a", 60)], [], () => false).spans).toBe(
      0
    )
  })
})

const AT = Date.parse("2026-11-19T17:40:00Z")
const LATER = Date.parse("2026-11-19T19:40:00Z")

/** Every word the tracker's table can say, each with real arguments. */
function everyWord(): Array<string> {
  const w = TRACKER_WORDS
  const strings = (value: unknown): Array<string> =>
    typeof value === "string"
      ? [value]
      : typeof value === "object" && value !== null
        ? Object.values(value).flatMap(strings)
        : []
  return [
    ...strings(w),
    w.running(AT, 2520),
    w.sheet.started("QM-1", AT),
    w.sheet.stoppedItself(7_200_000, LATER),
    w.sheet.stoppedByYou(LATER),
    w.sheet.all(7200),
    w.sheet.part(90),
    w.counted("QM-1", 5400, AT, LATER),
    w.counted("QM-1", 0, AT, LATER),
    w.week.total(0, 0),
    w.week.total(5400, 1),
    w.week.total(11_040, 3),
    ...(["read", "academy", "voice"] as const).flatMap((step) => [
      w.week.step(step),
      w.week.bar("QM-1", step, 360),
    ]),
    w.week.ticketTotal(5400),
    w.week.refused(1),
    w.week.refused(2),
  ]
}

describe("the tracker's words", () => {
  const shown = everyWord()

  it("are all here to check", () => {
    expect(shown.length).toBeGreaterThan(30)
  })

  it.each<[string, RegExp]>([
    [
      "a score or verdict",
      /\b(score|correct|wrong|verdict|grade|streak|level)\b/i,
    ],
    ["a status code", /\b[1-5]\d\d\b/],
    [
      "an internal name",
      /\b(span|sync|request|grant|status|home link|null|undefined|kind|idle|refused|server|409)\b/i,
    ],
  ])("hold no %s", (_, pattern) => {
    expect(shown.filter((word) => pattern.test(word))).toEqual([])
  })

  it("say a length as the owner reads one", () => {
    expect(hoursMinutes(0)).toBe("0 m")
    expect(hoursMinutes(42 * 60 + 59)).toBe("42 m")
    expect(hoursMinutes(5400)).toBe("1 h 30 m")
    expect(hoursMinutes(7200)).toBe("2 h")
    expect(runningClock(42 * 60)).toBe("0:42")
    expect(runningClock(65 * 60)).toBe("1:05")
  })

  it("say what was counted, on whose clock", () => {
    expect(
      TRACKER_WORDS.counted(
        "TB-101",
        5400,
        Date.parse("2026-11-19T17:40:00Z"),
        Date.parse("2026-11-19T19:40:00Z")
      )
    ).toBe("Counted 1 h 30 m at your desk on TB-101, 09:40 to 11:40.")
  })
})
