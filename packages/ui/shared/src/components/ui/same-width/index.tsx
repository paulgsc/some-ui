/**
 * A word on a control that changes ("Copy", "Copied"; "Play", "Stop") in a
 * box as wide as the widest it may say, so the control keeps its size and
 * what sits beside it stays where the thumb left it (HS1, `docs/ui-fit/
 * README.md` 2i). The other words set the width by CSS, so they are neither
 * read aloud nor found as text, and add no height.
 */
import type { JSX, ReactNode } from "react"

import { cn } from "../../../lib/utils"

export type SameWidthProps = {
  /** What shows now. */
  children?: ReactNode
  /** Every word it may show: it is as wide as the widest. */
  every: ReadonlyArray<string>
  className?: string
}

export const SameWidth = ({
  children,
  every,
  className,
}: SameWidthProps): JSX.Element => (
  <span className={cn("inline-grid", className)}>
    {every.map((word) => (
      <span
        key={word}
        aria-hidden="true"
        data-fits={word}
        className="invisible col-start-1 row-start-1 h-0 overflow-hidden whitespace-nowrap after:content-[attr(data-fits)]"
      />
    ))}
    <span className="col-start-1 row-start-1">{children}</span>
  </span>
)
