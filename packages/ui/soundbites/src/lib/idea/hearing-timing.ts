/**
 * How long home is given to hear a take, as plain values, so a workspace
 * that waits on home's hearing (www's shop, `lib/shop-home/hear`) can share
 * it through `@some-ui/soundbites/contract` without carrying soundbites.
 */

/** How often home is asked, and for how long. */
export type HearingTiming = {
  readonly pollMs: number
  /** From the take's keeping; the page's hidden time counts too. */
  readonly deadlineMs: number
}

/**
 * Home hears each note within a pass (about a minute) of holding it, and
 * the take reaches home within a drain of being kept, so three minutes is a
 * couple of passes' room.
 */
export const HEARING_TIMING: HearingTiming = {
  pollMs: 5_000,
  deadlineMs: 3 * 60_000,
}
