import { inMemoryStorage } from "@some-ui/core-utils"
import type { InterviewWeek, Ready } from "@some-ui/interview-week"
import {
  GROUND,
  INTERVIEW_WEEK_SCHEMA,
  INTERVIEW_WEEK_SCHEMA_V1,
  readWeek,
} from "@some-ui/interview-week"
import type { SimulatedPattern } from "@some-ui/voice-capture/testing"
import { simulatedPattern } from "@some-ui/voice-capture/testing"

import type { InterviewWeekPorts } from "@/lib/interview-week/runtime"
import { INTERVIEW_TAKE } from "@/lib/interview-week/take"

const guidelines = [
  "Says what the situation was.",
  "Says what you did, and what came of it.",
]

/** A week as the routine writes it (`some-ui.interview-week/1`), for 2026-w47. */
export const WEEK: InterviewWeek = {
  schema: INTERVIEW_WEEK_SCHEMA_V1,
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

/** A ready answer in the routine's shape (IW8), about `topic`, its claims citing `cite`. */
function readyAbout(topic: string, cite: Ready["another"]["sources"]): Ready {
  return {
    answer: [
      [
        "The situation",
        `On my phone app, ${topic} reached the screen as home can't be reached.`,
      ],
      [
        "The options",
        "I had two ways out: wait in each caller, or make not known yet a state of its own.",
      ],
      [
        "The choice and its cost",
        "I chose the state. It touched 54 files, and one place now decides.",
      ],
    ].map(([label, text]) => ({
      label,
      text,
      note: `${label} names what the listener can check.`,
      sources: cite,
    })),
    another: {
      text: "I keep one rule for anything the whole app shares: not known yet is a value, never folded into no.",
      note: "Leads with the principle, then the example.",
      sources: cite,
    },
    poor: {
      text: "We had some sync bugs, so I refactored the networking layer.",
      notes: [
        "Sync bugs doesn't say what failed, or for whom.",
        "No alternative is named, so no decision is shown.",
      ],
      sources: [],
    },
    cues: ["not paired too early", "wait in each caller", "the type holds it"],
  }
}

/** The same week as the routine writes it since IW8 (`/2`): each question with its ground and ready answer. */
export const WEEK_2: InterviewWeek = {
  ...WEEK,
  schema: INTERVIEW_WEEK_SCHEMA,
  questions: WEEK.questions.map((question) => ({
    ...question,
    ground: GROUND[question.family],
    ready: readyAbout(
      question.id,
      GROUND[question.family] === "work"
        ? [{ kind: "pull", repo: "some-ui", number: 3170 }]
        : []
    ),
  })),
}

/** The essay's opening (IW10): the card a `/2` week may open its cards on. */
export const OPENING_CARD_OF_WEEK = {
  id: "opening",
  source: { kind: "opening" },
  situation: "The opening of this week's interview essay, in your own voice.",
  script:
    "I'm paulgsc.\nThis week I'm practising how I explain a decision, one more week of it.",
  targetSeconds: 20,
} as const satisfies InterviewWeek["cards"][number]

/** `WEEK_2` with the essay's opening first among its cards. */
export const WEEK_2_OPENED: InterviewWeek = {
  ...WEEK_2,
  cards: [OPENING_CARD_OF_WEEK, ...WEEK_2.cards],
}

// The fixtures come in by the one door a week does.
for (const week of [WEEK, WEEK_2, WEEK_2_OPENED]) {
  if (!readWeek(week).ok) throw new Error(`${week.schema} fixture doesn't read`)
}

/**
 * The week's ports over the simulated microphone, recording as the phone does
 * (`../take`: up to 2 minutes, `send: "on-confirm"`), in
 * memory, home near and holding nothing, the cue's clock on timers; `over`
 * replaces any of them.
 */
export function fakePorts(over: Partial<InterviewWeekPorts> = {}): {
  readonly ports: InterviewWeekPorts
  readonly simulated: SimulatedPattern
} {
  const simulated = simulatedPattern({
    options: INTERVIEW_TAKE,
  })
  const { pattern, store } = simulated
  return {
    simulated,
    ports: {
      week: { week: WEEK, sha256: "a".repeat(64) },
      takes: {
        pattern,
        takes: { getSnapshot: store.getSnapshot, subscribe: store.subscribe },
        discard: store.discard,
        release: store.release,
      },
      storage: inMemoryStorage(),
      home: { reach: () => "near", subscribe: () => (): void => undefined },
      homeHolds: () => false,
      onHomeHolds: () => (): void => undefined,
      now: Date.now,
      newId: () => "unused",
      onVisibility: (listener) => {
        listener(false)
        return (): void => undefined
      },
      every: (ms, tick) => {
        const timer = setInterval(tick, ms)
        return (): void => clearInterval(timer)
      },
      ...over,
    },
  }
}
