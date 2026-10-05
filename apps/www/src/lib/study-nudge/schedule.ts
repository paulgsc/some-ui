/**
 * When `decideNudge` would next say "nudge", if nothing changed meanwhile:
 * a phone suspends the app's JavaScript off screen, so the Android app hands
 * the OS a scheduled notification in advance.
 *
 * It asks the same pure policy at successive future instants (page hidden)
 * rather than restating its rules as arithmetic, so the policy stays the one
 * place they live; the cost is a few hundred pure calls on backgrounding.
 * The caller recomputes on every return, the only time inputs can change.
 */
import type { NudgeDecision, NudgeInput } from "./index"
import { decideNudge } from "./index"

/** How far ahead to look: two days covers "studied today" plus a quiet night. */
const HORIZON_MS = 48 * 60 * 60_000
/** Resolution of the search; quiet hours are whole hours, so this is exact for them. */
const STEP_MS = 15 * 60_000
/** Never schedule for "right now": the app is only just leaving the screen. */
const MIN_DELAY_MS = 60_000

export type ScheduledNudge = {
  at: Date
  decision: Extract<NudgeDecision, { kind: "nudge" }>
}

export function nextNudge(
  input: Omit<NudgeInput, "now" | "pageVisible">,
  from: Date
): ScheduledNudge | null {
  // Aligned to the step grid, so "the hour quiet hours end" lands on :00.
  const first = Math.ceil((from.getTime() + MIN_DELAY_MS) / STEP_MS) * STEP_MS
  for (let t = first; t <= from.getTime() + HORIZON_MS; t += STEP_MS) {
    const at = new Date(t)
    const decision = decideNudge({ ...input, now: at, pageVisible: false })
    if (decision.kind === "nudge") return { at, decision }
    // No amount of waiting prepares a session or turns reminders on.
    if (
      decision.reason === "disabled" ||
      decision.reason === "nothing-prepared" ||
      decision.reason === "session-in-progress"
    ) {
      return null
    }
  }
  return null
}
