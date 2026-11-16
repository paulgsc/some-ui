import type { InterviewWeek } from "@some-ui/interview-week"
import { INTERVIEW_WEEK_SCHEMA, readWeek } from "@some-ui/interview-week"

const guidelines = [
  "Says what the situation was.",
  "Says what you did, and what came of it.",
]

/** A week as the routine writes it (`some-ui.interview-week/1`), for 2026-w47. */
export const WEEK: InterviewWeek = {
  schema: INTERVIEW_WEEK_SCHEMA,
  id: "2026-w47",
  by: "claude-routine",
  opens: "2026-11-16T00:00:00-08:00",
  due: "2026-11-22T23:59:00-08:00",
  company: { name: "Tidewell", about: "Tide tables for small harbours." },
  role: { title: "Backend engineer", about: "Owns the tide feed." },
  questions: [
    {
      id: "walk-me-through",
      family: "about-yourself",
      variant: "walk-me-through",
      prompt: "Walk me through your background.",
      targetSeconds: 90,
      guidelines,
    },
    {
      id: "conflict",
      family: "a-time-you",
      variant: "conflict",
      prompt: "Tell me about a time you disagreed with someone at work.",
      targetSeconds: 120,
      guidelines,
    },
    {
      id: "why-now",
      family: "why-this-role",
      variant: "why-now",
      prompt: "Why are you looking now?",
      targetSeconds: 60,
      guidelines,
    },
    {
      id: "decision-c266",
      family: "decision",
      variant: "the-trade-off",
      prompt: "What did that choice cost, and what did it buy?",
      targetSeconds: 120,
      guidelines,
      source: { kind: "call", id: "C266" },
    },
  ],
  cards: [
    {
      id: "epic-2931",
      source: { kind: "issue", repo: "some-ui", number: 2931 },
      situation: "Opening a team demo.",
      script:
        "I wanted to get better at the questions I find hardest.\nSo I built a week that asks them, and listens.",
      targetSeconds: 60,
    },
    {
      id: "invariant-rs1",
      source: {
        kind: "invariant",
        id: "RS1",
        path: "CLAUDE.md",
      },
      situation: "A short talk at a meetup.",
      script:
        "One workflow only reads and dispatches.\nA person checks every change to it.",
      targetSeconds: 60,
    },
  ],
}

// The fixture comes in by the one door a week does.
if (!readWeek(WEEK).ok) throw new Error("the fixture week doesn't read")
