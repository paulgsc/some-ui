/**
 * The quiet stop (GW2): a bite stops itself once the person has talked and
 * then gone quiet for the mode's `quietMs`. Pure: it reads the microphone's
 * level (0 to 1, voice-capture's meter) at each tick of the take's clock.
 *
 * Quiet counts only after something was heard. A meter that cannot run
 * (voice-capture reads a flat zero then) would otherwise stop every bite
 * at its first `quietMs`; without one, the bite runs to Done or the minute.
 */

/**
 * Below this the microphone hears no talking. The meter stretches speech
 * (about 0.05 to 0.2 RMS) by four, so talking reads 0.2 and up; a room's
 * hum and a TV across it read lower.
 */
const QUIET_LEVEL = 0.12

export type Quiet = {
  /** Whether talking has been heard yet in this bite. */
  readonly heard: boolean
  /** Since when it has been quiet after talking, or null while talking. */
  readonly since: number | null
}

export const NOT_HEARD: Quiet = { heard: false, since: null }

/** `quiet` after one reading of the level at `now`. */
export function hear(quiet: Quiet, level: number, now: number): Quiet {
  if (level >= QUIET_LEVEL) return { heard: true, since: null }
  if (!quiet.heard) return quiet
  return { heard: true, since: quiet.since ?? now }
}

/** How full the quiet bar is: 0 while talking, 1 when the bite stops. */
export function quietFill(quiet: Quiet, now: number, quietMs: number): number {
  if (quiet.since === null) return 0
  return Math.min(1, Math.max(0, (now - quiet.since) / quietMs))
}

/** Whether the quiet has lasted long enough to stop the bite. */
export function quietEnough(
  quiet: Quiet,
  now: number,
  quietMs: number
): boolean {
  return quietFill(quiet, now, quietMs) >= 1
}
