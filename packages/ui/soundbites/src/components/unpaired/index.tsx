/**
 * This phone isn't paired with home (ST34): what the screen can't do for
 * it, then the way to pairing. The app draws that way as a link to
 * Settings' Home page (`pair`); where it hands in none, the screen says
 * where pairing is instead, so the words never name a way the person can't
 * take.
 */
import type { JSX, ReactNode } from "react"
import { PAIR_WORDS } from "@soundbites/lib/studio/words"

export const Unpaired = ({
  line,
  pair,
}: {
  /** What the screen can't do while the phone isn't paired. */
  line: string
  /** The app's link to pairing, labelled `PAIR_WORDS.pair`. */
  pair?: ReactNode
}): JSX.Element => (
  <div className="flex flex-col gap-2">
    <p className="text-sm">{line}</p>
    {pair ?? (
      <p className="text-muted-foreground text-sm">{PAIR_WORDS.where}</p>
    )}
  </div>
)
