import type { ComponentProps, JSX, KeyboardEvent } from "react"

import { cn } from "../../../lib/utils"
import { Button } from "../button"

type HoldButtonProps = Omit<
  ComponentProps<typeof Button>,
  | "onPointerDown"
  | "onPointerUp"
  | "onPointerCancel"
  | "onPointerLeave"
  | "onKeyDown"
  | "onKeyUp"
  | "onContextMenu"
  | "asChild"
> & {
  /** A hold is under way: a finger leaving the button lets go. */
  holding: boolean
  /** Pressed: start what lasts while the button is held. */
  onHold: () => void
  /** Lifted, cancelled, or slid off while holding: stop it. */
  onRelease: () => void
}

/**
 * A button held to do something for as long as it is held, as a voice take
 * is: pointer down starts it; up, cancel, or leaving the button while held
 * stops it. Space and Enter hold it from a keyboard, without repeats. The
 * long-press menu is kept off, and the button takes no touch gestures, so a
 * hold is never read as a scroll or a selection.
 */
export const HoldButton = ({
  holding,
  onHold,
  onRelease,
  className,
  ...props
}: HoldButtonProps): JSX.Element => {
  const key =
    (act: () => void) =>
    (event: KeyboardEvent): void => {
      if (event.key !== " " && event.key !== "Enter") return
      event.preventDefault()
      if (!event.repeat) act()
    }
  return (
    <Button
      {...props}
      aria-pressed={holding}
      className={cn("touch-none select-none", className)}
      onPointerDown={onHold}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      onPointerLeave={holding ? onRelease : undefined}
      onKeyDown={key(onHold)}
      onKeyUp={key(onRelease)}
      onContextMenu={(event) => event.preventDefault()}
    />
  )
}
