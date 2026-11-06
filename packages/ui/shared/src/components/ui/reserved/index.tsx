/**
 * Room for a message that comes and goes, kept while it is gone.
 *
 * Block and flex layout is cumulative: every box sits where the boxes before
 * it end. So a message mounted on a tap (a refusal, a "Typo?", a preview)
 * moves everything after it, and in a sheet anchored to the bottom of the
 * screen, which grows upward, everything above it, before the thumb that
 * tapped has lifted. A `Reserved` holds `lines` lines of its own text,
 * shown or not, so what it says can change without moving anything.
 *
 * Promise HS1 (`apps/www/tests/ui-fit/stays-put.spec.ts`): between two taps
 * on one screen of the phone, a tap target still on screen keeps its box.
 * `lines` is a claim that the longest thing said here fits in that many
 * lines at the narrowest phone; the sweep is what checks it.
 *
 * Where nothing follows the message (the bottom of a page that grows down),
 * it needs no room kept: put it after the last control instead.
 */
import type { CSSProperties, JSX, ReactNode } from "react"

import { cn } from "../../../lib/utils"

export type ReservedProps = {
  /** What shows now; `null`, `false` or `undefined` for nothing. */
  children?: ReactNode
  /** How many lines of this box's own text to keep, shown or not. */
  lines?: number
  /**
   * The live region, mounted always so a screen reader hears what lands in
   * it: `alert` for a refusal, `status` for advice.
   */
  role?: "alert" | "status"
  /** Text, spacing and alignment: applied shown or not, so the room matches. */
  className?: string
  /** Paint only while something shows (a tinted background, a border). */
  shownClassName?: string
}

export const Reserved = ({
  children,
  lines = 1,
  role,
  className,
  shownClassName,
}: ReservedProps): JSX.Element => {
  const shown =
    children !== null && children !== undefined && children !== false
  // `lh` is this box's own line height, so the room follows its text size.
  const room: CSSProperties = { minHeight: `${lines}lh` }
  return (
    <div
      role={role}
      data-reserved=""
      className={cn(className, shown && shownClassName)}
    >
      <div style={room}>{children}</div>
    </div>
  )
}
