/**
 * Should the app interrupt you right now to say a session is waiting?
 *
 * Pure (no `Notification`, `navigator`, `localStorage` or clock of its own),
 * so when an interruption is welcome can be tested at any hour; the browser
 * plumbing lives in `service-worker.ts`.
 *
 * A badly timed nudge teaches people to dismiss the app's notifications on
 * sight, so every reason to stay quiet is named (`NudgeSilentReason`): the
 * settings UI shows which is in force, and tests assert the reason.
 *
 * Nothing here schedules: `decideNudge` is asked "is now a good time?", and
 * scheduling stays with the adaptive engine.
 */

import type { SessionRecord, SessionStatus } from "@/lib/tenant/types"

export type NudgePreferences = {
  enabled: boolean
  /** Local hour, 0-23, at which nudges stop. May be greater than `quietHoursEnd` (wraps midnight). */
  quietHoursStart: number
  /** Local hour, 0-23, at which nudges resume. */
  quietHoursEnd: number
  /** Floor on the gap between two nudges, measured from when one was shown. */
  minHoursBetweenNudges: number
  /**
   * What they agreed to be pushed about, by the server's topic names: a
   * consent record. The server holds the authoritative copy; this is re-sent
   * when a subscription is replaced. An empty list means "receives nothing",
   * so nothing defaults it to the full set.
   */
  pushTopics: Array<string>
}

/**
 * The topic the settings toggle's own words describe ("nudge me when a
 * session is prepared"), granted when reminders are turned on without
 * opening the topic list.
 */
const DEFAULT_PUSH_TOPIC = "lesson-ready"

export const DEFAULT_NUDGE_PREFERENCES: NudgePreferences = {
  // Off until asked for: an unrequested permission prompt is the fastest way
  // to be permanently denied. The settings toggle is the gesture that earns it.
  enabled: false,
  quietHoursStart: 22,
  quietHoursEnd: 8,
  minHoursBetweenNudges: 4,
  pushTopics: [DEFAULT_PUSH_TOPIC],
}

/**
 * Every reason to stay quiet, named. Ordered here the way `decideNudge`
 * evaluates them, most-absolute first.
 */
export type NudgeSilentReason =
  | "disabled"
  | "page-visible"
  | "quiet-hours"
  | "session-in-progress"
  | "studied-today"
  | "nothing-prepared"
  | "cooling-down"

export type NudgeDecision =
  | { kind: "silent"; reason: NudgeSilentReason }
  | { kind: "nudge"; sessionId: string; title: string; body: string }

export type NudgeInput = {
  sessions: ReadonlyArray<SessionRecord>
  now: Date
  /** `document.visibilityState === "visible"`, passed in so this stays pure. */
  pageVisible: boolean
  /** ISO timestamp of the last nudge actually shown, or null if never. */
  lastNudgeAt: string | null
  preferences: NudgePreferences
}

/** One line per silent reason, for the settings UI's status row. */
export const SILENT_REASON_LABEL: Record<NudgeSilentReason, string> = {
  disabled: "Reminders are off.",
  "page-visible": "You're looking at the app right now.",
  "quiet-hours": "It's quiet hours.",
  "session-in-progress": "A session is already running.",
  "studied-today": "You've already studied today.",
  "nothing-prepared": "No session is prepared and waiting.",
  "cooling-down": "You were reminded recently.",
}

/**
 * Quiet hours are a half-open local-hour range `[start, end)` that may wrap
 * midnight (22→8 is the default). Equal bounds mean "no quiet hours", not
 * "always quiet": `enabled` is the control for muting.
 */
export function isWithinQuietHours(
  hour: number,
  start: number,
  end: number
): boolean {
  if (start === end) return false
  if (start < end) return hour >= start && hour < end
  return hour >= start || hour < end
}

/** Same calendar day in the viewer's own timezone. */
function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function touchedToday(session: SessionRecord, now: Date): boolean {
  for (const stamp of [session.startedAt, session.completedAt]) {
    if (!stamp) continue
    const at = new Date(stamp)
    if (!Number.isNaN(at.getTime()) && isSameLocalDay(at, now)) return true
  }
  return false
}

/**
 * Which prepared session to name: rank before recency. `paused` is unfinished
 * work with momentum, `scheduled` was deliberately queued, `draft` merely
 * exists. `completed` and `active` were ruled out earlier.
 */
const CANDIDATE_RANK: Partial<Record<SessionStatus, number>> = {
  paused: 0,
  scheduled: 1,
  draft: 2,
}

function pickCandidate(
  sessions: ReadonlyArray<SessionRecord>
): SessionRecord | null {
  let best: SessionRecord | null = null
  let bestRank = Number.POSITIVE_INFINITY

  for (const session of sessions) {
    const rank = CANDIDATE_RANK[session.status]
    if (rank === undefined) continue
    if (rank > bestRank) continue
    if (rank < bestRank) {
      best = session
      bestRank = rank
      continue
    }
    // Same rank: the one they touched most recently is the one they meant.
    if (best && session.updatedAt > best.updatedAt) best = session
  }

  return best
}

function minutesOf(ms: number): number {
  return Math.max(1, Math.round(ms / 60_000))
}

function describe(session: SessionRecord): { title: string; body: string } {
  if (session.status === "paused") {
    const remaining = Math.max(
      0,
      session.totalDurationMs - (session.finalElapsedMs ?? 0)
    )
    return {
      title: "Pick up where you left off",
      body: `${session.name} · ${minutesOf(remaining)} min left`,
    }
  }

  const count = session.activities.length
  const activities = `${count} ${count === 1 ? "activity" : "activities"}`
  return {
    title: "Today's session is ready",
    body: `${session.name} · ${activities} · ~${minutesOf(session.totalDurationMs)} min`,
  }
}

function hoursSince(from: string, now: Date): number {
  const at = new Date(from)
  // An unparseable stamp reads as expired, or the nudge would never fire
  // again with no sign why.
  if (Number.isNaN(at.getTime())) return Number.POSITIVE_INFINITY
  return (now.getTime() - at.getTime()) / 3_600_000
}

/**
 * The whole policy. Read the guards top to bottom: each one is a reason
 * that outranks everything below it.
 */
export function decideNudge(input: NudgeInput): NudgeDecision {
  const { sessions, now, pageVisible, lastNudgeAt, preferences } = input

  if (!preferences.enabled) return { kind: "silent", reason: "disabled" }

  // Nothing to nudge someone towards a thing they are already looking at.
  if (pageVisible) return { kind: "silent", reason: "page-visible" }

  if (
    isWithinQuietHours(
      now.getHours(),
      preferences.quietHoursStart,
      preferences.quietHoursEnd
    )
  ) {
    return { kind: "silent", reason: "quiet-hours" }
  }

  // Above "studied today": a running session is happening *now*.
  if (sessions.some((s) => s.status === "active")) {
    return { kind: "silent", reason: "session-in-progress" }
  }

  if (sessions.some((s) => touchedToday(s, now))) {
    return { kind: "silent", reason: "studied-today" }
  }

  const candidate = pickCandidate(sessions)
  if (!candidate) return { kind: "silent", reason: "nothing-prepared" }

  // Last, so the status row shows the specific reason rather than a cooldown
  // masking that nothing is prepared.
  if (
    lastNudgeAt !== null &&
    hoursSince(lastNudgeAt, now) < preferences.minHoursBetweenNudges
  ) {
    return { kind: "silent", reason: "cooling-down" }
  }

  return { kind: "nudge", sessionId: candidate.id, ...describe(candidate) }
}

/**
 * Fill in fields a browser stored before they existed (settings persist as
 * one blob), like `withAudioDefaults`.
 */
export function withNudgeDefaults(
  stored: Partial<NudgePreferences> | undefined
): NudgePreferences {
  const merged = { ...DEFAULT_NUDGE_PREFERENCES, ...stored }
  // Stored before topics existed with the toggle on: grant the one topic the
  // toggle named, not everything. An explicitly empty list survives.
  return Array.isArray(merged.pushTopics)
    ? merged
    : { ...merged, pushTopics: [DEFAULT_PUSH_TOPIC] }
}
