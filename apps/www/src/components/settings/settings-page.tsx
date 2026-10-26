/**
 * The front desk's two shapes (paulgsc/some-ui#2107, SM1): the desk itself, a
 * card per concern that opens its page, and a concern's page, which says
 * which concern it is and leads back to the desk. A page holds one concern
 * and may scroll; another concern is another page.
 */
import type { JSX, ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@some-ui/shared"
import { Link } from "@tanstack/react-router"
import { ChevronLeft, ChevronRight } from "lucide-react"

import type { Concern, ConcernId } from "@/lib/front-desk"
import { concern, FRONT_DESK_WORDS } from "@/lib/front-desk"

/** One concern on the desk: its name and one line, the whole card a link. */
export const ConcernCard = ({ item }: { item: Concern }): JSX.Element => (
  <Link
    to={item.to}
    className="hover:bg-accent focus-visible:ring-ring block rounded-xl focus-visible:ring-2 focus-visible:outline-none"
  >
    <Card className="max-w-xl">
      <CardContent className="flex items-center gap-3 pt-[var(--card-p,1.5rem)]">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium">{item.title}</p>
          <p className="text-muted-foreground text-sm">{item.lead}</p>
        </div>
        <ChevronRight
          className="text-muted-foreground size-5 shrink-0"
          aria-hidden
        />
      </CardContent>
    </Card>
  </Link>
)

/** A concern's page: back to the desk, its name and lead, then its own. */
export const SettingsPage = ({
  id,
  children,
}: {
  id: ConcernId
  children: ReactNode
}): JSX.Element => {
  const { title, lead } = concern(id)
  return (
    <div className="max-w-xl space-y-4">
      <Link
        to="/settings"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {FRONT_DESK_WORDS.back}
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-sm">{lead}</p>
      </div>
      {children}
    </div>
  )
}

/** One block of a concern's page. */
export const SettingsBlock = ({
  title,
  children,
}: {
  title?: string
  children: ReactNode
}): JSX.Element => (
  <Card className="max-w-xl">
    {title === undefined ? null : (
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
    )}
    <CardContent
      className={
        title === undefined
          ? "space-y-4 pt-[var(--card-p,1.5rem)]"
          : "space-y-4"
      }
    >
      {children}
    </CardContent>
  </Card>
)
