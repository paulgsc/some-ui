/**
 * This phone isn't paired with home (ST34): what the screen can't do for
 * it, then the way to pairing, which the app draws as a link to Settings'
 * Home page (`pair`) and hands in to every screen that says it.
 */
import type { JSX, ReactNode } from "react"
import { cn } from "@some-ui/core-utils"

/** The way to pairing on a phone never paired: the app's link. */
export const PairWay = ({
  pair,
  className,
}: {
  /** The app's link to pairing, labelled `PAIR_WORDS.pair`. */
  pair: ReactNode
  className?: string
}): JSX.Element => <div className={cn("text-sm", className)}>{pair}</div>

export const Unpaired = ({
  line,
  pair,
}: {
  /** What the screen can't do while the phone isn't paired. */
  line: string
  pair: ReactNode
}): JSX.Element => (
  <div className="flex flex-col gap-2">
    <p className="text-sm">{line}</p>
    <PairWay pair={pair} />
  </div>
)
