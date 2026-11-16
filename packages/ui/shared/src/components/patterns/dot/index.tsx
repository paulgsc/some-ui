import type { JSX } from "react"

import type { DotMeaning } from "../../../lib/dot-meaning"
import { dotClass } from "../../../lib/dot-meaning"
import { cn } from "../../../lib/utils"

/**
 * A dot saying `meaning`, in the colour the phone's one table gives it
 * (`lib/dot-meaning`). Words beside it always say the same, so it is
 * hidden from a screen reader.
 */
export const Dot = ({
  meaning,
  className,
}: {
  meaning: DotMeaning
  className?: string
}): JSX.Element => (
  <span
    aria-hidden
    className={cn(
      "inline-block size-1.5 shrink-0 rounded-full",
      dotClass(meaning),
      className
    )}
  />
)
