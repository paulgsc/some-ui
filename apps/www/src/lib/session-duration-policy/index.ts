import type { SceneConfig } from "some-types-utils"

/**
 * The knobs that bound what a "session" is allowed to be, kept as a single
 * named, swappable value (an adapter) rather than magic numbers scattered
 * across the composer. A caller wanting looser/stricter limits passes a
 * different `SessionDurationPolicy` into `checkSessionDuration` - nothing
 * about the check itself is hard-coded to these particular numbers.
 */
export type SessionDurationPolicy = {
  /**
   * Floor below which a single activity block may not be scheduled. Guards
   * against a 0-minute (or trivially short) block slipping in - most
   * activities' own Configure-step field already enforces a minimum, but
   * the Advanced arrangement editor lets a scene's raw duration be set
   * directly, bypassing that field entirely. This is the one place every
   * write path (basic sequencing and advanced editing alike) is checked.
   */
  readonly minActivityDurationMs: number
  /**
   * Ceiling on the combined duration of every activity in one session.
   * Nothing stops a user from adding the same activity many times (the
   * composer allows repeats) or cranking several durations up - without a
   * cap, a "session" tuple can trivially cumulate to an absurd combined
   * length (a day, a week, more). This bounds the sum, not any single
   * activity.
   */
  readonly maxTotalDurationMs: number
}

const MINUTES = 60_000
const HOURS = 60 * MINUTES

/**
 * 5 minutes matches the tightest per-activity minimum already declared in
 * the activity catalog (honeycomb/leetype), so this floor never tightens
 * anything a normal Configure-step user would hit - it only closes the
 * Advanced-editor bypass. 4 hours is a deliberately generous but finite cap:
 * long enough for a genuine multi-activity study block, nowhere near a day.
 */
export const DEFAULT_SESSION_DURATION_POLICY: SessionDurationPolicy = {
  minActivityDurationMs: 0 * MINUTES,
  maxTotalDurationMs: 4 * HOURS,
}

/**
 * A type-state result: each outcome carries exactly the data its own
 * message needs, and there is no "valid: boolean" flag a caller could
 * forget to check - TypeScript's exhaustiveness checking on the `state`
 * discriminant forces every call site to handle all three shapes.
 */
export type DurationCheck =
  | { readonly state: "valid" }
  | {
      readonly state: "too-short"
      readonly sceneName: string
      readonly actualMinutes: number
      readonly minMinutes: number
    }
  | {
      readonly state: "too-long"
      readonly totalMinutes: number
      readonly maxMinutes: number
    }

/**
 * Validates the actual, final scene durations - not the friendly
 * per-activity form fields - so it catches a policy violation regardless of
 * which composer step produced the numbers (basic sequencing or a manual
 * Advanced-arrangement edit).
 */
export function checkSessionDuration(
  scenes: ReadonlyArray<Pick<SceneConfig, "scene_name" | "duration">>,
  policy: SessionDurationPolicy = DEFAULT_SESSION_DURATION_POLICY
): DurationCheck {
  for (const scene of scenes) {
    if (scene.duration < policy.minActivityDurationMs) {
      return {
        state: "too-short",
        sceneName: scene.scene_name,
        actualMinutes: scene.duration / MINUTES,
        minMinutes: policy.minActivityDurationMs / MINUTES,
      }
    }
  }

  const totalMs = scenes.reduce((sum, scene) => sum + scene.duration, 0)
  if (totalMs > policy.maxTotalDurationMs) {
    return {
      state: "too-long",
      totalMinutes: Math.round(totalMs / MINUTES),
      maxMinutes: policy.maxTotalDurationMs / MINUTES,
    }
  }

  return { state: "valid" }
}

/** "255" -> "4h 15m"; "240" -> "4h"; "45" -> "45m". Works for any policy value, not just clean hour multiples. */
function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

function assertNever(value: never): never {
  throw new Error(`Unhandled DurationCheck state: ${JSON.stringify(value)}`)
}

/** Human-readable explanation of a non-"valid" `DurationCheck`, for display next to Save. */
export function describeDurationCheck(check: DurationCheck): string | null {
  const { state } = check

  switch (state) {
    case "valid": {
      return null
    }
    case "too-short": {
      return `"${check.sceneName}" is ${check.actualMinutes} min, below the ${check.minMinutes}-minute minimum per activity.`
    }
    case "too-long": {
      return `Total duration (${formatMinutes(check.totalMinutes)}) exceeds the ${formatMinutes(check.maxMinutes)} session cap.`
    }
    default: {
      return assertNever(state)
    }
  }
}
