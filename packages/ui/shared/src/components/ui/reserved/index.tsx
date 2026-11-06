/**
 * Room for a message that comes and goes, kept while it is gone, so what it
 * says can change without moving a control (HS1, `docs/ui-fit/README.md`
 * 2i). Where nothing follows the message on a page that grows down, it needs
 * no room: put it after the last control instead.
 *
 * `lines` claims the longest thing said here fits in that many lines at the
 * narrowest phone; `apps/www/tests/ui-fit/stays-put.spec.ts` checks it.
 */
import type { JSX, ReactNode } from "react"

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
}

export const Reserved = ({
  children,
  lines = 1,
  role,
  className,
}: ReservedProps): JSX.Element => (
  <div role={role} className={className}>
    {/* `lh` is this box's own line height, so the room follows its text size. */}
    <div style={{ minHeight: `${lines}lh` }}>{children}</div>
  </div>
)
