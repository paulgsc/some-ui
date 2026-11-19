import type { AnchorHTMLAttributes } from "react"
import { forwardRef } from "react"
import { CardLink, CardLinkBody } from "@some-ui/shared"
import { createLink } from "@tanstack/react-router"

/**
 * A card that opens a page of this app (#3234): `CardLink`'s look (raised,
 * outlined, tinted, with its chevron) over the router's own link, so a call
 * site keeps the typed `to` and `params` and writes only the card's words.
 * Every card on the phone that opens one of the app's pages is drawn by this
 * or by `CardLink` itself; a card that opens nothing keeps the plain look.
 */
const CardAnchor = forwardRef<
  HTMLAnchorElement,
  AnchorHTMLAttributes<HTMLAnchorElement>
>(({ children, ...props }, ref) => (
  <CardLink ref={ref} {...props}>
    <CardLinkBody>{children}</CardLinkBody>
  </CardLink>
))
CardAnchor.displayName = "CardAnchor"

/** A card that opens a page of this app: `<CardRoute to=…>words</CardRoute>`. */
export const CardRoute = createLink(CardAnchor)
