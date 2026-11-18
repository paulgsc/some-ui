import { readyFor } from "@interview-week/lib/monday/__tests__/fixture"
import type { InterviewWeek } from "@interview-week/lib/week"
import {
  FAMILIES,
  GROUND,
  INTERVIEW_WEEK_SCHEMA,
  INTERVIEW_WEEK_SCHEMA_V1,
  isOpening,
  OPENING_CARD,
  questionOfDay,
  readWeek,
  RESERVED_QUESTION_ID,
  SLUG,
  SLUG_MAX,
} from "@interview-week/lib/week"
import { describe, expect, it } from "vitest"

const guidelines = ["Says what the situation was.", "Says what they did."]

/** A first-version week (IW4): no ready answers. */
const week = (): InterviewWeek => ({
  schema: INTERVIEW_WEEK_SCHEMA_V1,
  id: "2026-w47",
  by: "claude-routine",
  opens: "2026-11-16T00:00:00-08:00",
  due: "2026-11-22T23:59:00-08:00",
  company: { name: "Tidewell", about: "Tide tables for harbours." },
  role: { title: "Backend engineer", about: "Owns the tide feed." },
  questions: [
    {
      id: "walk-me-through",
      family: "about-yourself",
      variant: "walk-me-through",
      prompt: "Walk me through it.",
      targetSeconds: 90,
      guidelines,
    },
    {
      id: "conflict",
      family: "a-time-you",
      variant: "conflict",
      prompt: "A time you disagreed.",
      targetSeconds: 120,
      guidelines,
    },
    {
      id: "why-now",
      family: "why-this-role",
      variant: "why-now",
      prompt: "Why now?",
      targetSeconds: 60,
      guidelines,
    },
    {
      id: "decision-c266",
      family: "decision",
      variant: "the-trade-off",
      prompt: "What did it cost?",
      targetSeconds: 120,
      guidelines,
      source: { kind: "call", id: "C266" },
    },
  ],
  cards: [
    {
      id: "epic-2931",
      source: { kind: "issue", repo: "some-ui", number: 2931 },
      situation: "A demo.",
      script: "I built this.",
      targetSeconds: 90,
    },
    {
      id: "invariant-rs1",
      source: { kind: "invariant", id: "RS1", path: "CLAUDE.md" },
      situation: "A talk.",
      script: "It only reads.",
      targetSeconds: 60,
    },
  ],
})

const problems = (body: unknown): Array<string> => {
  const read = readWeek(body)
  return read.ok ? [] : read.problems
}

describe("the interview week's format", () => {
  it("keeps every variant's id a slug a ref can name, unique across families", () => {
    const variants = Object.values(FAMILIES).flatMap((f) => Object.keys(f))
    expect(new Set(variants).size).toBe(variants.length)
    for (const v of variants) {
      expect(v).toMatch(SLUG)
      expect(v).not.toBe(RESERVED_QUESTION_ID)
    }
  })

  it("reads a whole week", () => {
    expect(problems(week())).toEqual([])
  })

  it("refuses an id a take's ref can't carry", () => {
    const w = week()
    w.questions[0] = { ...w.questions[0]!, id: "read" }
    w.questions[1] = { ...w.questions[1]!, id: "Conflict" }
    w.cards[0] = { ...w.cards[0]!, id: "x".repeat(SLUG_MAX + 1) }
    expect(problems(w)).toHaveLength(2)
    w.questions[1] = { ...w.questions[1], id: "conflict" }
    w.cards[0] = { ...w.cards[0], id: "epic-2931" }
    expect(problems(w)).toEqual([
      'questions[0] ("read"): no question may be named "read"',
    ])
  })

  it("refuses an id used twice, a variant its family lacks, and a source on the wrong question", () => {
    const w = week()
    w.questions[2] = { ...w.questions[2]!, id: "conflict", variant: "strength" }
    w.questions[0] = { ...w.questions[0]!, variant: "constructor" }
    w.cards[1] = { ...w.cards[1]!, id: "epic-2931" }
    w.questions[3] = { ...w.questions[3]!, source: undefined }
    expect(problems(w)).toEqual([
      `questions[0] ("walk-me-through"): about-yourself's variants are walk-me-through, what-you-build, how-you-got-here`,
      'questions[2] ("conflict"): its id is used twice',
      `questions[2] ("conflict"): why-this-role's variants are why-this-role, why-this-company, why-now`,
      'questions[3] ("decision-c266"): a decision question names its call, and no other question names one',
      'cards[1] ("epic-2931"): its id is used twice',
    ])
  })

  it("reads the essay's opening only as the week's first card, named for it, read in 10 to 40 seconds (IW10)", () => {
    const opening = {
      id: OPENING_CARD,
      source: { kind: "opening" } as const,
      situation: "The essay's opening.",
      script: "I'm paulgsc. This week I practise telling a decision.",
      targetSeconds: 20,
    }
    const base = week()
    const withOpening = { ...base, cards: [opening, ...base.cards] }
    expect(readWeek(withOpening).ok).toBe(true)
    expect(readWeek(withOpening).ok && isOpening(withOpening.cards[0]!)).toBe(
      true
    )
    const problems = (cards: InterviewWeek["cards"]): Array<string> => {
      const read = readWeek({ ...base, cards })
      return read.ok ? [] : read.problems
    }
    expect(problems([...base.cards, opening])).toEqual([
      "cards[2] (\"opening\"): the essay's opening is the week's first card",
    ])
    expect(
      problems([{ ...opening, targetSeconds: 60 }, base.cards[0]!])
    ).toEqual(['cards[0] ("opening"): the opening is read in 10 to 40 seconds'])
    expect(
      problems([
        { ...opening, id: "intro" },
        { ...base.cards[0]!, id: OPENING_CARD },
        { ...base.cards[1]!, targetSeconds: 30 },
      ])
    ).toEqual([
      'cards[0] ("intro"): the card named "opening" is the essay\'s opening, and no other card is',
      'cards[1] ("opening"): the card named "opening" is the essay\'s opening, and no other card is',
      'cards[2] ("invariant-rs1"): a card is read in 60 to 120 seconds',
    ])
  })

  it("holds the week to the owner's Monday and Sunday", () => {
    expect(problems({ ...week(), id: "2026-w46" })).toEqual([
      "the week that opens 2026-11-16 is 2026-w47",
    ])
    expect(
      problems({ ...week(), due: "2026-11-22T23:59:00-07:00" })
    ).toHaveLength(1)
  })

  it("reads a second-version week only with every question's ready answer, and a first only with none", () => {
    const v1 = week()
    const v2 = {
      ...v1,
      schema: INTERVIEW_WEEK_SCHEMA,
      questions: v1.questions.map((q) => ({
        ...q,
        ground: GROUND[q.family],
        ready: readyFor(q.targetSeconds),
      })),
    }
    expect(problems(v2)).toEqual([])
    expect(
      problems({
        ...v2,
        questions: [{ ...v1.questions[0]! }, ...v2.questions.slice(1)],
      })
    ).toEqual([
      `questions[0] ("walk-me-through"): every question of a ${INTERVIEW_WEEK_SCHEMA} week has its ready answer`,
      `questions[0] ("walk-me-through"): every question of a ${INTERVIEW_WEEK_SCHEMA} week names its ground`,
    ])
    expect(problems({ ...v1, questions: v2.questions })).toHaveLength(8)
    expect(
      problems({
        ...v2,
        questions: [
          { ...v2.questions[0]!, ground: "work" },
          ...v2.questions.slice(1),
        ],
      })
    ).toEqual([
      `questions[0] ("walk-me-through"): the about-yourself family's ground is open`,
    ])
  })

  it("holds every claim of a question about the body of work to a source, and leaves an open question's sources optional", () => {
    const ready = readyFor(90)
    const unsourced = {
      ...ready,
      answer: ready.answer.map((p) => ({ ...p, sources: [] })),
      another: { ...ready.another, sources: [] },
    }
    const at = (r: unknown): Array<string> =>
      problems({
        ...week(),
        schema: INTERVIEW_WEEK_SCHEMA,
        questions: week().questions.map((q) => ({
          ...q,
          ground: GROUND[q.family],
          ready: r,
        })),
      })
    // Only decision-c266, the one question about the body of work, is held.
    expect(at(unsourced)).toEqual([
      ...[0, 1, 2, 3].map(
        (k) =>
          `questions[3] ("decision-c266").ready.answer[${k}]: a question about the body of work names a source for every claim`
      ),
      'questions[3] ("decision-c266").ready.another: a question about the body of work names a source for every claim',
    ])
    expect(at({ ...ready, score: 3 }).join("\n")).toMatch(/score/)
  })
})

describe("today's question", () => {
  const w = week()
  const ids = (days: Array<string>): Array<string | null> =>
    days.map((d) => questionOfDay(w, d)?.id ?? null)

  it("takes one a day in the week's order from Monday, round again, with nothing carried over", () => {
    expect(
      ids([
        "2026-11-16",
        "2026-11-17",
        "2026-11-18",
        "2026-11-19",
        "2026-11-20",
        "2026-11-21",
        "2026-11-22",
      ])
    ).toEqual([
      "walk-me-through",
      "conflict",
      "why-now",
      "decision-c266",
      "walk-me-through",
      "conflict",
      "why-now",
    ])
  })

  it("has none on a day outside the week", () => {
    expect(ids(["2026-11-15", "2026-11-23", "not a day"])).toEqual([
      null,
      null,
      null,
    ])
  })
})
