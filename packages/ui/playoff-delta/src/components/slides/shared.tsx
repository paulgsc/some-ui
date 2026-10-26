import type { CSSProperties, JSX, ReactNode } from "react"
import {
  signOf,
  type StorySeason,
  type StoryWeek,
} from "@playoff-delta/lib/story"

export type SlideProps = {
  season: StorySeason
  week: StoryWeek
}

/** The colour a change in share shows in, by its rounded sign. */
export const tone = (change: number): string => {
  const sign = signOf(change)
  return sign > 0 ? "text-success" : sign < 0 ? "text-destructive" : ""
}

/** A reveal delay, as the CSS custom property the reveals read. */
export const delay = (
  seconds: number
): CSSProperties & Record<"--d", string> => ({
  "--d": `${seconds}s`,
})

/** A line that rises in after `at` seconds. */
export const Reveal = ({
  at,
  className = "",
  children,
}: {
  at: number
  className?: string
  children: ReactNode
}): JSX.Element => {
  return (
    <div className={`pd-in ${className}`} style={delay(at)}>
      {children}
    </div>
  )
}

export const Kicker = ({ children }: { children: ReactNode }): JSX.Element => (
  <span className="pd-kicker">{children}</span>
)
