import type { AnchorHTMLAttributes } from "react"
import { forwardRef } from "react"
import type { CardLinkProps } from "@some-ui/shared"
import { CardLink, CardLinkBody } from "@some-ui/shared"
import { createLink } from "@tanstack/react-router"

/** `CardLink` with its words stacked: what `CardRoute` draws, as an `<a>`. */
export const CardAnchor = forwardRef<
  HTMLAnchorElement,
  AnchorHTMLAttributes<HTMLAnchorElement> & Pick<CardLinkProps, "tone">
>(({ children, ...props }, ref) => (
  <CardLink ref={ref} {...props}>
    <CardLinkBody>{children}</CardLinkBody>
  </CardLink>
))
CardAnchor.displayName = "CardAnchor"

/**
 * A card that opens a page of this app (#3234): `CardLink`'s look over the
 * router's own link, so a call site keeps the typed `to` and `params` and
 * writes only the card's words: `<CardRoute to=…>words</CardRoute>`.
 */
export const CardRoute = createLink(CardAnchor)
