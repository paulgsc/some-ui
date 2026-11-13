/**
 * The way back to the page above, at the top of a page as an app's header
 * carries it (`‹ Episodes`): its parent's name after a chevron, with `label`
 * as its accessible name where the name alone would not say where it leads.
 */
import type { JSX, ReactNode } from "react"
import type { FileRoutesByTo } from "@/routeTree.gen"
import { Link } from "@tanstack/react-router"
import { ChevronLeft } from "lucide-react"

export const BackLink = ({
  to,
  label,
  children,
}: {
  to: keyof FileRoutesByTo
  label?: string
  children: ReactNode
}): JSX.Element => (
  <Link
    to={to}
    aria-label={label}
    className="text-muted-foreground hover:bg-accent hover:text-foreground -ml-2 inline-flex h-9 items-center gap-0.5 self-start rounded-full pr-3 pl-1 text-sm font-semibold"
  >
    <ChevronLeft aria-hidden className="size-5" />
    {children}
  </Link>
)
