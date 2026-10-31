/**
 * What a reflection is and the rules it lives by, as pure functions over the
 * kept list. `./index` is the store that applies them; nothing here touches
 * storage, the clock or React.
 *
 * A reflection is one thing said about a session while it was fresh: a voice
 * note, a typed line, or the three one-tap answers (one set per session).
 * Each carries its session's ID. They are for the next session, not an
 * archive, so the phone keeps at most `REFLECTION_LIMIT` of them across every
 * session, nothing is dropped to make room, and one older than
 * `STALE_AFTER_MS` reads as stale. Room comes back only by letting some go.
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

export type Answers = Partial<Record<QuestionKey, string>>

/** k: every reflection on the phone, all sessions together. */
export const REFLECTION_LIMIT = 20

/** What a reflection refused for want of a slot says. */
export const NO_ROOM = "No room for another on this phone: let one go first."

/** Older than a week, a reflection no longer says how things are going. */
export const STALE_AFTER_MS = 7 * 24 * 60 * 60_000

type ReflectionBody =
  | { kind: "answers"; answers: Answers }
  | { kind: "text"; text: string }
  /** The audio is kept beside it, under the reflection's `id`. */
  | { kind: "voice"; durationMs: number; mimeType: string; bytes: number }

export type Reflection = {
  id: string
  sessionId: string
  /** ISO. When it was said; a changed answer is said again, so it moves. */
  createdAt: string
  /** How far into the session, or null when said after it ended. */
  atMs: number | null
  body: ReflectionBody
}

/** The result of asking to keep one: room is never made by dropping another. */
export type Kept =
  | { kind: "kept"; next: Array<Reflection> }
  | { kind: "full"; next: ReadonlyArray<Reflection> }

/** Puts `incoming` in, replacing the one with its `id`; full at the limit. */
export function admit(
  kept: ReadonlyArray<Reflection>,
  incoming: Reflection,
  limit = REFLECTION_LIMIT
): Kept {
  const others = kept.filter((r) => r.id !== incoming.id)
  if (others.length >= limit) return { kind: "full", next: kept }
  return { kind: "kept", next: [incoming, ...others] }
}

/** The one-tap answers kept for `sessionId`, if any. */
export function answersOf(
  kept: ReadonlyArray<Reflection>,
  sessionId: string
): { id: string; answers: Answers } | null {
  for (const r of kept) {
    if (r.sessionId === sessionId && r.body.kind === "answers")
      return { id: r.id, answers: r.body.answers }
  }
  return null
}

/**
 * Sets `sessionId`'s answers. Its one set is replaced in place, so a changed
 * answer costs no slot; clearing every answer lets the set go.
 */
export function withAnswers(
  kept: ReadonlyArray<Reflection>,
  sessionId: string,
  answers: Answers,
  made: { id: string; createdAt: string; atMs: number | null }
): Kept {
  const existing = answersOf(kept, sessionId)
  const given = clean(answers)
  if (Object.keys(given).length === 0) {
    return {
      kind: "kept",
      next: kept.filter((r) => r.id !== existing?.id),
    }
  }
  return admit(kept, {
    id: existing?.id ?? made.id,
    sessionId,
    createdAt: made.createdAt,
    atMs: made.atMs,
    body: { kind: "answers", answers: given },
  })
}

function ageMs(reflection: Reflection, nowMs: number): number {
  return Math.max(0, nowMs - Date.parse(reflection.createdAt))
}

export function isStale(reflection: Reflection, nowMs: number): boolean {
  return ageMs(reflection, nowMs) >= STALE_AFTER_MS
}

export function staleCount(
  kept: ReadonlyArray<Reflection>,
  nowMs: number
): number {
  return kept.filter((r) => isStale(r, nowMs)).length
}

/** `today`, `1 day`, `9 days`: a reflection's age, as the screens say it. */
export function describeAge(ms: number): string {
  const days = Math.floor(ms / (24 * 60 * 60_000))
  if (days < 1) return "today"
  return `${days} day${days === 1 ? "" : "s"}`
}

export type SessionReflections = {
  sessionId: string
  reflections: Array<Reflection>
  /** The oldest one's age: how long this session's have been waiting. */
  oldestMs: number
  stale: boolean
}

/** Each session holding reflections, the longest-waiting first. */
export function bySession(
  kept: ReadonlyArray<Reflection>,
  nowMs: number
): Array<SessionReflections> {
  const groups = new Map<string, Array<Reflection>>()
  for (const r of kept) {
    const group = groups.get(r.sessionId)
    if (group) group.push(r)
    else groups.set(r.sessionId, [r])
  }
  return [...groups]
    .map(([sessionId, reflections]) => {
      const oldestMs = Math.max(...reflections.map((r) => ageMs(r, nowMs)))
      return {
        sessionId,
        reflections: inOrder(reflections),
        oldestMs,
        stale: reflections.some((r) => isStale(r, nowMs)),
      }
    })
    .sort((a, b) => b.oldestMs - a.oldestMs)
}

/** One session's, in the order they were said. */
export function inOrder(kept: ReadonlyArray<Reflection>): Array<Reflection> {
  return [...kept].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** Only answers a question offers survive. */
function clean(value: unknown): Answers {
  if (typeof value !== "object" || value === null) return {}
  const answers: Answers = {}
  for (const question of QUESTIONS) {
    const answer: unknown = Reflect.get(value, question.key)
    if (question.options.some(([option]) => option === answer)) {
      answers[question.key] = String(answer)
    }
  }
  return answers
}

function bodyOf(value: unknown): ReflectionBody | null {
  if (typeof value !== "object" || value === null) return null
  const field = (key: string): unknown => Reflect.get(value, key)
  const kind = field("kind")
  if (kind === "answers") {
    const answers = clean(field("answers"))
    return Object.keys(answers).length > 0 ? { kind, answers } : null
  }
  if (kind === "text") {
    const text = field("text")
    return typeof text === "string" && text.trim() !== ""
      ? { kind, text }
      : null
  }
  if (kind === "voice") {
    const durationMs = field("durationMs")
    const mimeType = field("mimeType")
    const bytes = field("bytes")
    return typeof durationMs === "number" &&
      typeof mimeType === "string" &&
      typeof bytes === "number"
      ? { kind, durationMs, mimeType, bytes }
      : null
  }
  return null
}

/** A stored row as a reflection, or null for anything else. */
export function parseReflection(value: unknown): Reflection | null {
  if (typeof value !== "object" || value === null) return null
  const field = (key: string): unknown => Reflect.get(value, key)
  const id = field("id")
  const sessionId = field("sessionId")
  const createdAt = field("createdAt")
  const atMs = field("atMs")
  const body = bodyOf(field("body"))
  if (
    typeof id !== "string" ||
    typeof sessionId !== "string" ||
    typeof createdAt !== "string" ||
    Number.isNaN(Date.parse(createdAt)) ||
    !(atMs === null || typeof atMs === "number") ||
    body === null
  )
    return null
  return { id, sessionId, createdAt, atMs, body }
}

/**
 * The list before reflections had dates: one set of answers per session,
 * `{ id: sessionId, answers }`. Each becomes an answers reflection dated
 * `staleAt`, since nothing says when it was given and it is from before this
 * version: it reads as stale, so it is among the first to share or let go.
 */
export function fromLegacy(
  rows: ReadonlyArray<unknown>,
  staleAt: string
): Array<Reflection> {
  return rows.flatMap((row) => {
    if (typeof row !== "object" || row === null) return []
    const sessionId: unknown = Reflect.get(row, "id")
    const answers = clean(Reflect.get(row, "answers"))
    if (typeof sessionId !== "string" || Object.keys(answers).length === 0)
      return []
    return [
      {
        id: `legacy-${sessionId}`,
        sessionId,
        createdAt: staleAt,
        atMs: null,
        body: { kind: "answers", answers },
      },
    ]
  })
}
