/**
 * Should the app interrupt you right now to say a session is waiting?
 *
 * This module answers exactly that and nothing else. It is pure — no
 * `Notification`, no `navigator`, no `localStorage`, no clock of its own —
 * so the interesting question (when is an interruption *welcome*) is
 * decided by a function that can be tested at any hour of any day, and the
 * browser plumbing that acts on the answer lives next door in
 * `service-worker.ts`.
 *
 * ## Why the decision is a value, not a side effect
 *
 * A nudge is the one part of this app that speaks without being spoken to.
 * Getting it wrong is expensive in a way a wrong render is not: a
 * notification that fires while you are already studying, or at 3am, or for
 * the fourth time in an hour, teaches you to dismiss the app's
 * notifications on sight, and there is no undo for that. So every reason to
 * stay quiet is named (`NudgeSilentReason`) rather than expressed as an
 * early `return` — the settings UI can show you which one is currently in
 * force, and a test can assert the *reason*, not just the silence.
 *
 * ## What it deliberately does not know
 *
 * Nothing here schedules anything. `decideNudge` is asked, repeatedly, "is
 * now a good time?"; it never says "ask me again at 19:00". That keeps the
 * whole scheduling question — which is genuinely the adaptive engine's, and
 * which will eventually move server-side alongside the rest of the learning
 * model — out of a client module that would only have to give it back.
 */

import type { SessionRecord, SessionStatus } from "../tenant/types"

export type NudgePreferences = {
  enabled: boolean
  /** Local hour, 0-23, at which nudges stop. May be greater than `quietHoursEnd` (wraps midnight). */
  quietHoursStart: number
  /** Local hour, 0-23, at which nudges resume. */
  quietHoursEnd: number
  /** Floor on the gap between two nudges, measured from when one was shown. */
  minHoursBetweenNudges: number
  /**
   * What they agreed to be pushed about, by the server's own topic names.
   *
   * A preference in shape only — it is really a *consent record*, and it
   * lives here because this is already the block that says what this app
   * may do unprompted, and because it has to round-trip with `enabled`.
   * The server holds the authoritative copy alongside the subscription; this
   * is what gets re-sent when a subscription is replaced, which is the one
   * moment the page needs to know it without asking.
   *
   * An empty list is a real answer, not a missing one: the server honours
   * it as "receives nothing" rather than reading it as "receives
   * everything". Nothing here defaults it to the full set for that reason.
   */
  pushTopics: Array<string>
}

/**
 * The topic the settings toggle's own words describe: "nudge me when a
 * session is prepared". Used as the grant when someone turns reminders on
 * without opening the topic list — not a guess at what they want, but the
 * thing the control they just used says it does.
 */
export const DEFAULT_PUSH_TOPIC = "lesson-ready"

export const DEFAULT_NUDGE_PREFERENCES: NudgePreferences = {
  // Off until asked for, and not negotiable: turning this on requires a
  // browser permission prompt, and a permission prompt nobody asked for is
  // the fastest way to get permanently denied. The settings toggle is the
  // gesture that earns it.
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
 * midnight — 22→8 is the default and the common case, so the wrapping
 * branch is the one that has to be right rather than the edge case.
 * Equal bounds mean "no quiet hours" rather than "always quiet": a person
 * who drags both ends together has flattened the range, not muted the app,
 * and `enabled` is the control for muting it.
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

/** Same calendar day in the viewer's own timezone, which is the only sense
 * of "today" a person means when they say they've studied today. */
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
 * Which prepared session is worth naming in the notification.
 *
 * Rank before recency, because the statuses mean genuinely different
 * things to a person being interrupted: `paused` is unfinished work with
 * momentum behind it, `scheduled` is something they deliberately queued,
 * and `draft` is merely something that exists. `completed` and `active` are
 * not candidates at all — the callers above have already ruled those out
 * for stronger reasons.
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
  // An unparseable stamp is a corrupted cooldown, and the safe reading of a
  // corrupted cooldown is "expired" — the alternative is a nudge that never
  // fires again and gives no sign why.
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

  // Ranked above "studied today" because it is the stronger statement: a
  // running session is happening *now*, whatever the day's history says.
  if (sessions.some((s) => s.status === "active")) {
    return { kind: "silent", reason: "session-in-progress" }
  }

  if (sessions.some((s) => touchedToday(s, now))) {
    return { kind: "silent", reason: "studied-today" }
  }

  const candidate = pickCandidate(sessions)
  if (!candidate) return { kind: "silent", reason: "nothing-prepared" }

  // Last, so that a person inspecting the status row sees the specific
  // reason rather than a cooldown masking the fact that nothing is
  // prepared anyway.
  if (
    lastNudgeAt !== null &&
    hoursSince(lastNudgeAt, now) < preferences.minHoursBetweenNudges
  ) {
    return { kind: "silent", reason: "cooling-down" }
  }

  return { kind: "nudge", sessionId: candidate.id, ...describe(candidate) }
}

/**
 * Fill in fields a browser stored before they existed, the same way
 * `withAudioDefaults` does for the audio block and for the same reason —
 * settings persist as one blob, so a new nested field comes back
 * `undefined` from any browser that saved before it was added.
 */
export function withNudgeDefaults(
  stored: Partial<NudgePreferences> | undefined
): NudgePreferences {
  const merged = { ...DEFAULT_NUDGE_PREFERENCES, ...stored }
  // A browser that stored preferences before topics existed has no grant
  // recorded, but did turn the toggle on — and the toggle says it nudges
  // about prepared sessions. Reading that as the one topic it names is
  // narrower than the alternative (everything) and matches what they were
  // actually shown. An explicitly empty list survives untouched.
  return Array.isArray(merged.pushTopics)
    ? merged
    : { ...merged, pushTopics: [DEFAULT_PUSH_TOPIC] }
}
