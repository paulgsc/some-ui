import { boundedList } from "@/lib/bounded-list"

/**
 * "How did it go?" on a finished session's wrap: one optional tap per
 * question, in TOPIK's lesson-survey words (worthwhile, difficulty,
 * enthusiasm), asked of the whole session. Kept on this device, for the
 * latest `REFLECTION_LIMIT` sessions.
 */

export const QUESTIONS = [
  {
    key: "worthwhile",
    label: "Worth it",
    options: [
      ["yes", "Yes"],
      ["somewhat", "Somewhat"],
      ["no", "No"],
    ],
  },
  {
    key: "difficulty",
    label: "Pace",
    options: [
      ["too-easy", "Too easy"],
      ["right", "Right"],
      ["too-hard", "Too hard"],
    ],
  },
  {
    key: "enthusiasm",
    label: "Energy",
    options: [
      ["keen", "Keen"],
      ["neutral", "Neutral"],
      ["drained", "Drained"],
    ],
  },
] as const

type QuestionKey = (typeof QUESTIONS)[number]["key"]

export type Reflection = Partial<Record<QuestionKey, string>>

const REFLECTION_LIMIT = 20

type Entry = { id: string; answers: unknown }

const store = boundedList(
  "some-ui:session-reflections",
  REFLECTION_LIMIT,
  (value): value is Entry =>
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "id") === "string"
)

/** Only answers a question offers survive a read. */
function answersOf(value: unknown): Reflection {
  if (typeof value !== "object" || value === null) return {}
  const answers: Reflection = {}
  for (const question of QUESTIONS) {
    const answer: unknown = Reflect.get(value, question.key)
    if (question.options.some(([option]) => option === answer)) {
      answers[question.key] = String(answer)
    }
  }
  return answers
}

/** Every kept reflection, newest first. */
export function allReflections(): Array<{
  sessionId: string
  answers: Reflection
}> {
  return store
    .read()
    .map((e) => ({ sessionId: e.id, answers: answersOf(e.answers) }))
}

export function readReflection(sessionId: string): Reflection {
  return answersOf(store.read().find((e) => e.id === sessionId)?.answers)
}

export function writeReflection(sessionId: string, answers: Reflection): void {
  store.put({ id: sessionId, answers }, (e) => e.id === sessionId)
}
