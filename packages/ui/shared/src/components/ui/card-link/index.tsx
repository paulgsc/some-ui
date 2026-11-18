import type { AnchorHTMLAttributes, JSX, ReactNode } from "react"
import { forwardRef } from "react"
import { Slot, Slottable } from "@radix-ui/react-slot"
import { ChevronRight } from "lucide-react"

import { cn } from "../../../lib/utils"

/*
 * A card that opens something (paulgsc/some-ui#3234): the one look every
 * card link on the phone takes, so a card you can tap looks like it can be
 * tapped (owner, 2026-11-18: "if a card is a button that goes somewhere, it
 * should look like a button"). It is raised and tinted, with a stronger
 * outline than a card that only shows something, and a chevron in the
 * theme's colour at its end; it gives under a press. A card that opens
 * nothing keeps the plain `Card` look and none of this.
 *
 * It draws a link only by way of its child (`asChild`, as `Button` does), so
 * the router's own link, with its typed path, does the opening; without
 * `asChild` it is a plain `<a>`. Its children are the card's words, stacked;
 * the chevron is the part's.
 */

/** The look, for the rare caller that can't render through `CardLink`. */
export const CARD_LINK_CLASS =
  "group/card-link flex w-full items-center gap-3 rounded-2xl border-2 border-primary/25 bg-linear-to-b from-card to-brand/15 p-3 text-left text-card-foreground shadow-md shadow-primary/10 ring-1 ring-inset ring-card transition-[transform,box-shadow,border-color] hover:border-primary/50 active:translate-y-px active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:active:translate-y-0"

export type CardLinkProps = {
  /** Render through the one child, a link, merging the look onto it. */
  asChild?: boolean
  className?: string
  children: ReactNode
} & AnchorHTMLAttributes<HTMLAnchorElement>

/** A card that opens something: its words, then a chevron. */
export const CardLink = forwardRef<HTMLAnchorElement, CardLinkProps>(
  ({ asChild = false, className, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "a"
    return (
      <Comp
        ref={ref}
        data-card-link=""
        className={cn(CARD_LINK_CLASS, className)}
        {...props}
      >
        <Slottable>{children}</Slottable>
        <span
          aria-hidden="true"
          className="bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-full shadow-sm transition-transform group-hover/card-link:translate-x-0.5 motion-reduce:transition-none"
        >
          <ChevronRight className="size-4" />
        </span>
      </Comp>
    )
  }
)
CardLink.displayName = "CardLink"

/** A card link's words, stacked to its left: name, then lines. */
export const CardLinkBody = ({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}): JSX.Element => (
  <span
    className={cn(
      "flex min-w-0 flex-1 flex-col items-start gap-1 self-stretch",
      className
    )}
  >
    {children}
  </span>
)
