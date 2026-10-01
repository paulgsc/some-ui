import type { HTMLAttributes } from "react"
import { forwardRef } from "react"

import { cn } from "../../lib/utils"

/**
 * A card's padding is one value, `--card-p`, set on the card and read by
 * its parts: 16px on a phone, 24px from `sm` up. 24px a side is a desktop
 * budget; on a 390px phone, inside a 16px page gutter, it left a card's
 * content 310px of the screen's width, and a stack of cards a band of
 * nothing between each pair of them.
 *
 * A variable rather than `p-4 sm:p-6` on each part, so a caller's own
 * padding still replaces the part's outright: `cn` drops a conflicting
 * `p-4` but would keep `sm:p-6`, which would quietly win over a caller's
 * `p-0` from `sm` up. A part rendered outside a `Card` falls back to 24px.
 * A caller adding back the top padding a part drops writes
 * `pt-[var(--card-p,1.5rem)]`, not `pt-6`, to keep the phone's value.
 */
const CARD_PADDING = "p-[var(--card-p,1.5rem)]"

const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border bg-card text-card-foreground shadow [--card-p:1rem] sm:[--card-p:1.5rem]",
        className
      )}
      {...props}
    />
  )
)
Card.displayName = "Card"

const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col space-y-1.5", CARD_PADDING, className)}
      {...props}
    />
  )
)
CardHeader.displayName = "CardHeader"

const CardTitle = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  )
)
CardTitle.displayName = "CardTitle"

const CardDescription = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn(CARD_PADDING, "pt-0", className)} {...props} />
  )
)
CardContent.displayName = "CardContent"

const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center", CARD_PADDING, "pt-0", className)}
      {...props}
    />
  )
)
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
