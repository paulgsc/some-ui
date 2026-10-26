/** The front desk's shapes (`lib/front-desk`): its cards, and a concern's page. */
import type { JSX, ReactNode } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@some-ui/shared"
import { Link } from "@tanstack/react-router"
import { ChevronLeft, ChevronRight } from "lucide-react"

import type { Concern, ConcernId } from "@/lib/front-desk"
import { concern, FRONT_DESK_WORDS, pageOf } from "@/lib/front-desk"

export const PageHeading = ({
  title,
  lead,
}: {
  title: string
  lead: string
}): JSX.Element => (
  <div className="space-y-1">
    <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
    <p className="text-muted-foreground text-sm">{lead}</p>
  </div>
)

export const ConcernCard = ({ item }: { item: Concern }): JSX.Element => (
  <Link
    to={pageOf(item.id)}
    className="hover:bg-accent focus-visible:ring-ring block rounded-xl focus-visible:ring-2 focus-visible:outline-none"
  >
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <CardTitle>{item.title}</CardTitle>
          <CardDescription>{item.lead}</CardDescription>
        </div>
        <ChevronRight
          className="text-muted-foreground size-5 shrink-0"
          aria-hidden
        />
      </CardHeader>
    </Card>
  </Link>
)

export const SettingsPage = ({
  id,
  children,
}: {
  id: ConcernId
  children: ReactNode
}): JSX.Element => (
  <div className="max-w-xl space-y-4">
    <Link
      to="/settings"
      className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
    >
      <ChevronLeft className="size-4" aria-hidden />
      {FRONT_DESK_WORDS.title}
    </Link>
    <PageHeading title={concern(id).title} lead={concern(id).lead} />
    {children}
  </div>
)

export const SettingsBlock = ({
  title,
  children,
}: {
  title?: string
  children: ReactNode
}): JSX.Element => (
  <Card>
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
