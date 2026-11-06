/**
 * Room for a message that comes and goes, kept while it is gone, so what it
 * says can change without moving a control (HS1, `docs/ui-fit/README.md`
 * 2i). Where nothing follows the message on a page that grows down, it needs
 * no room: put it after the last control instead.
 *
 * `lines` claims the longest thing said here fits in that many lines at the
 * narrowest phone; `apps/www/tests/ui-fit/stays-put.spec.ts` checks it.
 * Where everything it may say is known ahead (a switch's few lines), `fits`
 * keeps room for the tallest of them at whatever width it gets, so no claim
 * about lines is needed.
 */
import type { HTMLAttributes, JSX, ReactNode } from "react"

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
  /**
   * Everything it may say, when that is known ahead: the room is as tall as
   * the tallest at this width. Drawn hidden, by CSS, so it is neither read
   * aloud nor found as text.
   */
  fits?: ReadonlyArray<string>
  /** Text, spacing and alignment: applied shown or not, so the room matches. */
  className?: string
}

export const Reserved = ({
  children,
  lines = 1,
  role,
  fits,
  className,
}: ReservedProps): JSX.Element => (
  <div role={role} className={cn(fits !== undefined && "grid", className)}>
    {fits?.map((text) => (
      <div
        key={text}
        aria-hidden="true"
        data-fits={text}
        className="invisible col-start-1 row-start-1 after:content-[attr(data-fits)]"
      />
    ))}
    {/* `lh` is this box's own line height, so the room follows its text size. */}
    <div
      className={fits === undefined ? undefined : "col-start-1 row-start-1"}
      style={{ minHeight: `${lines}lh` }}
    >
      {children}
    </div>
  </div>
)

export type SameWidthProps = {
  /** What shows now. */
  children?: ReactNode
  /** Every word it may show: it is as wide as the widest. */
  every: ReadonlyArray<string>
  className?: string
}

/**
 * A word that changes ("Copy", "Copied"; "Sending", "On home") in a box as
 * wide as the widest it may say, so what sits beside it stays put (HS1). The
 * others are drawn hidden, by CSS, so they are neither read aloud nor found
 * as text.
 */
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

export type AlertOrStatusProps = {
  /** A refusal, when there is one: said in the alert region. */
  alert?: ReactNode
  /** Advice, said in the status region while there is no refusal. */
  status?: ReactNode
  /** How many lines to keep for the longer of the two. */
  lines?: number
  /** Text size, for both. */
  className?: string
  alertClassName?: string
  statusClassName?: string
}

/**
 * A refusal or advice in one room, both live regions mounted always: what a
 * tap answers moves nothing, whichever of the two it is (HS1).
 */
export const AlertOrStatus = ({
  alert,
  status,
  lines,
  className,
  alertClassName,
  statusClassName,
}: AlertOrStatusProps): JSX.Element => {
  const refused = alert !== null && alert !== undefined && alert !== false
  return (
    <div className={cn("grid", className)}>
      <Reserved
        role="status"
        lines={lines}
        className={cn("col-start-1 row-start-1", statusClassName)}
      >
        {refused ? null : status}
      </Reserved>
      <Reserved
        role="alert"
        lines={lines}
        className={cn("col-start-1 row-start-1", alertClassName)}
      >
        {alert}
      </Reserved>
    </div>
  )
}

export type HeldProps = HTMLAttributes<HTMLElement> & {
  /** Whether it shows; drawn either way. */
  shown: boolean
  /** `div` where it holds blocks; `span` by default, as in a button. */
  as?: "span" | "div"
}

/**
 * Drawn whether it shows or not, and until it does unseen, unheard and out
 * of reach: showing it fills room already kept, so it moves nothing (HS1).
 */
export const Held = ({
  shown,
  as: Tag = "span",
  className,
  ...rest
}: HeldProps): JSX.Element => (
  <Tag
    {...rest}
    aria-hidden={shown ? undefined : true}
    inert={!shown}
    className={cn(className, !shown && "invisible")}
  />
)
