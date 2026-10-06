/**
 * "How did it go?" on a finished session's wrap: one optional tap per
 * question, in TOPIK's lesson-survey words (worthwhile, difficulty,
 * enthusiasm), asked of the whole session.
 *
 * Kept on this device only, and bounded: the answers of the latest
 * `REFLECTION_LIMIT` sessions, so the store cannot grow with use. Any failure
 * (no storage, a full quota, a document this build cannot read) reads as no
 * answers and is never raised: the wrap works without them.
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

export const REFLECTION_LIMIT = 20

const STORAGE_KEY = "some-ui:session-reflections"

type Entry = { id: string; answers: Reflection }

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

function readAll(storage: Storage): Array<Entry> {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]")
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry: unknown) => {
      if (typeof entry !== "object" || entry === null) return []
      const id: unknown = Reflect.get(entry, "id")
      if (typeof id !== "string") return []
      return [{ id, answers: answersOf(Reflect.get(entry, "answers")) }]
    })
  } catch {
    return []
  }
}

export function readReflection(
  sessionId: string,
  storage: Storage = localStorage
): Reflection {
  return readAll(storage).find((e) => e.id === sessionId)?.answers ?? {}
}

/** Keeps `answers` as this session's, newest first, dropping the oldest past the limit. */
export function writeReflection(
  sessionId: string,
  answers: Reflection,
  storage: Storage = localStorage
): void {
  const rest = readAll(storage).filter((e) => e.id !== sessionId)
  const next = [{ id: sessionId, answers }, ...rest].slice(0, REFLECTION_LIMIT)
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // A full or missing store loses this answer, never the wrap.
  }
}
