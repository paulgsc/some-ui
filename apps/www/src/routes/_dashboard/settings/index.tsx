import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { MOBILE_APP } from "@/lib/build-profile"
import { VIEWER_BUILD } from "@/lib/data-mode"
import { concernsHere, FRONT_DESK_WORDS } from "@/lib/front-desk"
import {
  ConcernCard,
  PageHeading,
  SettingsBlock,
} from "@/components/settings/settings-page"

/** The front desk (lib/wings): a card per concern (`lib/front-desk`). */
const FrontDesk = (): JSX.Element => (
  <div className="max-w-xl space-y-4">
    {!MOBILE_APP && (
      <PageHeading
        title={FRONT_DESK_WORDS.title}
        lead={FRONT_DESK_WORDS.lead}
      />
    )}
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
  component: FrontDesk,
})
