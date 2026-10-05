import type { SceneConfig } from "@some-ui/types"

/**
 * The bounds on what a "session" may be, as one swappable value: pass a
 * different `SessionDurationPolicy` to `checkSessionDuration` for other limits.
 */
export type SessionDurationPolicy = {
  /**
   * Floor for a single activity block. Configure-step fields already enforce
   * minimums, but the Advanced editor sets raw scene durations directly; this
   * checks every write path.
   */
  readonly minActivityDurationMs: number
  /**
   * Ceiling on the combined duration of one session: repeats and long
   * durations could otherwise sum to a day or more. Bounds the sum, not any
   * single activity.
   */
  readonly maxTotalDurationMs: number
}

const MINUTES = 60_000
const HOURS = 60 * MINUTES

/**
 * 5 minutes matches the tightest per-activity catalog minimum, so it only
 * closes the Advanced-editor bypass. 4 hours: generous but finite.
 */
export const DEFAULT_SESSION_DURATION_POLICY: SessionDurationPolicy = {
  minActivityDurationMs: 5 * MINUTES,
  maxTotalDurationMs: 4 * HOURS,
}

/**
 * A type-state result: each outcome carries the data its message needs, with
 * no `valid: boolean` to forget to check.
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
 * Validates the final scene durations, not the per-activity form fields, so
 * it catches a violation from either basic sequencing or an Advanced edit.
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
