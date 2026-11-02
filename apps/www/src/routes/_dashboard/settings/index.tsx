import type { JSX } from "react"
import { createFileRoute, redirect } from "@tanstack/react-router"

import { VIEWER_BUILD } from "@/lib/data-mode"
import {
  concernsHere,
  deskBar,
  FRONT_DESK_WORDS,
  pageOf,
} from "@/lib/front-desk"
import {
  ConcernCard,
  PageHeading,
  SettingsBlock,
} from "@/components/settings/settings-page"

/** The front desk (lib/wings): a card per concern (`lib/front-desk`, `deskBar`). */
const FrontDesk = (): JSX.Element => (
  <div className="max-w-xl space-y-4">
    <PageHeading title={FRONT_DESK_WORDS.title} lead={FRONT_DESK_WORDS.lead} />
    {concernsHere().map((item) => (
      <ConcernCard key={item.id} item={item} />
    ))}
    {VIEWER_BUILD ? (
      <SettingsBlock title={FRONT_DESK_WORDS.viewerTitle}>
        <p className="text-muted-foreground text-sm">
          {FRONT_DESK_WORDS.viewer}
        </p>
      </SettingsBlock>
    ) : null}
  </div>
)

export const Route = createFileRoute("/_dashboard/settings/")({
  beforeLoad: () => {
    const first = deskBar()?.tabs[0]
    if (first) throw redirect({ to: pageOf(first.id), replace: true })
  },
  component: FrontDesk,
})
