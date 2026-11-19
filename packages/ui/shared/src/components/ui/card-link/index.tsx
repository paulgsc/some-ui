import type { ForwardedRef, HTMLAttributes, JSX, ReactNode } from "react"
import { forwardRef, useCallback } from "react"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "../../../lib/utils"

/*
 * A card that opens something (paulgsc/some-ui#3234): the one look every
 * card link on the phone takes, so a card you can tap looks like it can be
 * tapped (owner, 2026-11-18: "if a card is a button that goes somewhere, it
 * should look like a button"). It is raised, with a shadow in the theme's
 * colour, a subtle outline and a light tint, and it gives under a press; it
 * carries no glyph (owner, 2026-11-19: "good use of shadows, good use of
 * subtle outlines… We don't want that arrow thingy"). A card that opens
 * nothing keeps the plain `Card` look and none of this.
 *
 * It draws through its child (`asChild`, as `Button` does): the router's own
 * link, with its typed path, or a `<button>` that opens a screen or sheet in
 * place. Without `asChild` it is a plain `<a>`. Its children are the card's
 * words, stacked (`CardLinkBody`).
 */

/** The look; only `CardLink` draws it. */
const CARD_LINK_CLASS =
  "flex w-full items-center gap-3 rounded-2xl border border-primary/35 bg-linear-to-b from-card to-brand/10 dark:to-primary/10 p-3 text-left text-card-foreground shadow-lg shadow-primary/20 dark:shadow-xl dark:shadow-primary/30 ring-1 ring-inset ring-white/10 transition-[translate,box-shadow,border-color] hover:border-primary/60 active:translate-y-px active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:active:translate-y-0"

/**
 * A card link filled with the brand's colour, for the one a page leads with
 * (today's question): solid brand on every theme (its `dark:` stop overrides
 * the card link's dark tint, which would fade it toward the page).
 */
const BRAND_CLASS =
  "border-transparent from-brand to-brand dark:to-brand dark:shadow-brand/25 text-brand-foreground rounded-3xl p-4"

export type CardLinkProps = {
  /** Render through the one child, a link, merging the look onto it. */
  asChild?: boolean
  /** `brand` for the card a page leads with; `card` otherwise. */
  tone?: "card" | "brand"
  className?: string
  children: ReactNode
} & HTMLAttributes<HTMLElement> & {
    /** Where it opens, when it draws its own `<a>` (no `asChild`). */
    href?: string
  }

/** Hands `node` to `ref`, whichever kind it is. */
function setRef(
  ref: ForwardedRef<HTMLElement>,
  node: HTMLElement | null
): void {
  if (typeof ref === "function") ref(node)
  else if (ref !== null) ref.current = node
}

/** A card that opens something: its words. */
export const CardLink = forwardRef<HTMLElement, CardLinkProps>(
  ({ asChild = false, tone = "card", className, children, ...props }, ref) => {
    // One callback for the `<a>`, so its ref isn't cleared on each render.
    const own = useCallback(
      (node: HTMLElement | null) => setRef(ref, node),
      [ref]
    )
    const look = cn(CARD_LINK_CLASS, tone === "brand" && BRAND_CLASS, className)
    // Through the caller's own element (a router link, a button), or an `<a>`.
    return asChild ? (
      <Slot ref={ref} className={look} {...props}>
        {children}
      </Slot>
    ) : (
      <a ref={own} className={look} {...props}>
        {children}
      </a>
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
