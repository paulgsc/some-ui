/**
 * The learner's takes of grammar-lens lines (adaptive-learning canon Rem.
 * 4.16), on the take pattern (`@some-ui/voice-capture`). Recording, keeping
 * the audio and where each take is kept are the phone's (www's
 * `lib/lens-takes`, a desk of takes on the pattern), so this is the port
 * only: the lens runtime taps the pattern for the line in view, and the card
 * draws the pattern's parts.
 *
 * The phone's desk chooses the lens's options: many takes a line, beside each
 * other (`takes: { per: "many" }`), and only the newest plays
 * (`play: "latest"`), as "Mine" did.
 */

import type { PatternTake, TakePattern } from "@some-ui/voice-capture"

export type LensTakeSnapshot = {
  /** The takes kept, as the take pattern lists them; the same array while nothing changed. */
  readonly takes: ReadonlyArray<PatternTake>
  /** No new take can be kept until home holds some of those kept. */
  readonly full: boolean
}

export type LensTakes = {
  /** The phone's take pattern, on which a line's takes are taken. */
  readonly pattern: TakePattern
  /** The same object while nothing changed. */
  readonly getSnapshot: () => LensTakeSnapshot
  readonly subscribe: (listener: () => void) => () => void
}
