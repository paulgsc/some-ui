/** A screen's line saying what just happened, read out when it changes. */
import type { JSX } from "react"

export const Notice = ({ text }: { text: string }): JSX.Element => (
  <p aria-live="polite" className="text-muted-foreground min-h-5 text-sm">
    {text}
  </p>
)
