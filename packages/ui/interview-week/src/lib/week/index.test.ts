import type { InterviewWeek } from "@interview-week/lib/week"
import {
  FAMILIES,
  INTERVIEW_WEEK_SCHEMA,
  readWeek,
  RESERVED_QUESTION_ID,
  SLUG,
  SLUG_MAX,
} from "@interview-week/lib/week"
import { describe, expect, it } from "vitest"

const guidelines = ["Says what the situation was.", "Says what they did."]

const week = (): InterviewWeek => ({
  schema: INTERVIEW_WEEK_SCHEMA,
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

  it("holds the week to the owner's Monday and Sunday", () => {
    expect(problems({ ...week(), id: "2026-w46" })).toEqual([
      "the week that opens 2026-11-16 is 2026-w47",
    ])
    expect(
      problems({ ...week(), due: "2026-11-22T23:59:00-07:00" })
    ).toHaveLength(1)
  })
})
