/**
 * When `decideNudge` would next say "nudge", if nothing changed meanwhile.
 *
 * The Android app needs this and the web builds do not. A browser tab keeps
 * a timer running and asks the policy "is now a good time?" every few
 * minutes; a phone suspends the app's JavaScript the moment it leaves the
 * screen, so the question has to be answered *in advance* and handed to
 * the OS as a scheduled local notification.
 *
 * It answers by asking the same pure policy at successive future instants
 * (with the page hidden, which is the premise), rather than by restating
 * its rules as arithmetic. The policy stays the one place the rules live
 * - quiet hours, "studied today", the cooldown - and a change to any of
 * them is scheduled correctly with no change here. The price is a few
 * hundred calls to a pure function when the app goes to the background.
 *
 * "If nothing changed" is the assumption the caller has to keep true: the
 * schedule is cancelled and recomputed every time the app comes back,
 * which is the only moment sessions or preferences can change.
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
