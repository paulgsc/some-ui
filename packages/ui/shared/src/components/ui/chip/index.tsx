import type { JSX, ReactNode } from "react"

import type { DotMeaning } from "../../../lib/dot-meaning"
import { cn } from "../../../lib/utils"
import { Dot } from "../../patterns/dot"

/**
 * A chip that filters or orders a list: what it shows, how many it shows
 * (none for an order), whether it is picked, and an optional dot for what
 * the items mean. Takes on home
 * (TAKES3, TAKES20), its reconciling page and a Rust Rounds ticket's points
 * (RR24) draw their filters with it, in a `CHIP_BAR`; the Cooking page its
 * Show and Order menu.
 */
export const Chip = ({
  picked,
  count,
  dot = null,
  onTap,
  className,
  children,
}: {
  picked: boolean
  count?: number
  dot?: DotMeaning | null
  onTap: () => void
  /** Classes beside its own: an edge, on a surface the same as its fill. */
  className?: string
  children: ReactNode
}): JSX.Element => (
  <button
    type="button"
    aria-pressed={picked}
    onClick={onTap}
    className={cn(
      "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm",
      picked ? "bg-foreground text-background" : "bg-card",
      className
    )}
  >
    {dot !== null && <Dot meaning={dot} className="size-2" />}
    {children}
    {count !== undefined && (
      <span className="tabular-nums opacity-75">{count}</span>
    )}
  </button>
)

/** The bar chips sit in, which scrolls sideways on its own. */
export const CHIP_BAR =
  "bg-background sticky top-0 z-10 flex gap-2 overflow-x-auto py-1"
