import type { ForwardedRef, HTMLAttributes, JSX, ReactNode } from "react"
import { forwardRef, useCallback } from "react"
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
 * It draws through its child (`asChild`, as `Button` does): the router's own
 * link, with its typed path, or a `<button>` that opens a screen or sheet in
 * place. Without `asChild` it is a plain `<a>`. Its children are the card's words, stacked;
 * the chevron is the part's.
 */

/** The look; only `CardLink` draws it, so every card link has the chevron too. */
const CARD_LINK_CLASS =
  "group/card-link flex w-full items-center gap-3 rounded-2xl border-2 border-primary/60 bg-linear-to-b from-card to-brand/15 dark:to-primary/15 p-3 text-left text-card-foreground shadow-md shadow-primary/10 dark:shadow-lg dark:shadow-primary/25 ring-1 ring-inset ring-card transition-[translate,box-shadow,border-color] hover:border-primary active:translate-y-px active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:active:translate-y-0"

/**
 * A card link filled with the brand's colour, for the one a page leads with
 * (today's question): solid brand on every theme (its `dark:` stop overrides
 * the card link's dark tint, which would fade it toward the page), and its
 * chevron takes the brand's own pair, so it shows on every theme, those
 * whose brand is their primary included.
 */
const BRAND_CLASS =
  "border-transparent from-brand to-brand dark:to-brand dark:shadow-brand/25 text-brand-foreground rounded-3xl p-4"
const CHEVRON = {
  card: "bg-primary text-primary-foreground",
  brand: "bg-brand-foreground text-brand",
} as const

export type CardLinkProps = {
  /** Render through the one child, a link, merging the look onto it. */
  asChild?: boolean
  /** `brand` for the card a page leads with; `card` otherwise. */
  tone?: keyof typeof CHEVRON
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

/** A card that opens something: its words, then a chevron. */
export const CardLink = forwardRef<HTMLElement, CardLinkProps>(
  ({ asChild = false, tone = "card", className, children, ...props }, ref) => {
    // One callback for the `<a>`, so its ref isn't cleared on each render.
    const own = useCallback(
      (node: HTMLElement | null) => setRef(ref, node),
      [ref]
    )
    const look = cn(CARD_LINK_CLASS, tone === "brand" && BRAND_CLASS, className)
    const chevron = (
      <span
        aria-hidden="true"
        className={cn(
          CHEVRON[tone],
          "grid size-7 shrink-0 place-items-center rounded-full shadow-sm transition-transform group-hover/card-link:translate-x-0.5 motion-reduce:transition-none"
        )}
      >
        <ChevronRight className="size-4" />
      </span>
    )
    // Through the caller's own element (a router link, a button), or an `<a>`.
    return asChild ? (
      <Slot ref={ref} className={look} {...props}>
        <Slottable>{children}</Slottable>
        {chevron}
      </Slot>
    ) : (
      <a ref={own} className={look} {...props}>
        {children}
        {chevron}
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
