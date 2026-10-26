import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { MOBILE_APP } from "@/lib/build-profile"
import { VIEWER_BUILD } from "@/lib/data-mode"
import { concernsHere, FRONT_DESK_WORDS } from "@/lib/front-desk"
import { ConcernCard, SettingsBlock } from "@/components/settings/settings-page"

/**
 * The front desk (lib/wings): what belongs to no wing, a card per concern,
 * each opening its own page (`lib/front-desk`, paulgsc/some-ui#2107). This
 * phone and home are the Android app's ("apk" pages, which `concernsHere`
 * offers only behind `hasAudience`, A3); the account is the web's; a viewer's desk says
 * the data is a sample that nothing keeps. Study settings are Practice's own
 * (`/practice/settings`) on both.
 */
const FrontDesk = (): JSX.Element => (
  <div className="max-w-xl space-y-4">
    {!MOBILE_APP && (
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {FRONT_DESK_WORDS.title}
        </h1>
        <p className="text-muted-foreground text-sm">{FRONT_DESK_WORDS.lead}</p>
      </div>
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
