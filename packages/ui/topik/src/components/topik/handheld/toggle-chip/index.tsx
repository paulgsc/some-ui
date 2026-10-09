/**
 * One answer the learner can pick and take back: Korean first, with a
 * small second line beneath. The review's answers and the genre picker use
 * it.
 */

import type { JSX } from "react"
import { cn } from "@some-ui/core-utils"

export const ToggleChip = ({
  ko,
  small,
  smallLang,
  picked,
  onToggle,
}: {
  ko: string
  /** Its English, or a scene's feeling in Korean; none for a label alone. */
  small?: string
  smallLang?: "en" | "ko"
  picked: boolean
  onToggle: () => void
}): JSX.Element => (
  <button
    type="button"
    aria-pressed={picked}
    onClick={onToggle}
    className={cn(
      "border-border flex min-h-12 flex-col items-start justify-center rounded-2xl border px-3 py-2 text-left",
      picked && "bg-primary text-primary-foreground border-primary"
    )}
  >
    <span lang={small === undefined ? undefined : "ko"} className="break-keep">
      {ko}
    </span>
    {small && (
      <span lang={smallLang} className="text-xs opacity-75">
        {small}
      </span>
    )}
  </button>
)

/** `list` with `item` taken out, or put in at the end. */
export const toggled = (list: Array<string>, item: string): Array<string> =>
  list.includes(item) ? list.filter((kept) => kept !== item) : [...list, item]
