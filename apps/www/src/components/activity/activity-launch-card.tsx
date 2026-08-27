import type { JSX } from "react"
import type { ActivityDefinition } from "@some-ui/activity-catalog"
import { Card, CardContent } from "@some-ui/shared"
import { Link } from "@tanstack/react-router"

import { ActivityIcon } from "@/components/activity-icon"
import { ActivityInputHint } from "@/components/activity/activity-input"
import {
  ActivityMaturityBadge,
  ActivityMaturityNote,
} from "@/components/activity/activity-maturity"
import { AudioActivityHint } from "@/components/audio/audio-activity-notice"

type ActivityLaunchCardProps = {
  activity: ActivityDefinition
}

/**
 * One activity, as the dashboard's front door presents it.
 *
 * Extracted from the route so the recommended set and the search overlay show
 * the same card - a result that looked different from a recommendation would
 * read as a different kind of thing, when it is the same activity found a
 * different way.
 */
export const ActivityLaunchCard = ({
  activity,
}: ActivityLaunchCardProps): JSX.Element => {
  return (
    <Link
      to="/sessions/new"
      search={{ activity: activity.id }}
      className="block"
    >
      <Card className="hover:border-primary/50 h-full transition-colors">
        <CardContent className="flex flex-col gap-2 pt-6">
          <div className="flex items-start justify-between gap-2">
            <ActivityIcon
              icon={activity.icon}
              className="text-primary size-6"
            />
            {/* Said before the click, where the expectation is set -
                not after, where the disappointment lands. */}
            <ActivityMaturityBadge activity={activity} />
          </div>
          <p className="font-semibold">{activity.name}</p>
          <p className="text-muted-foreground text-sm">
            {activity.description}
          </p>
          <ActivityMaturityNote activity={activity} />
          {/* Both said before the click, where the expectation is set: what
              this will do to your ears, and what it will ask of your hands. */}
          <ActivityInputHint activity={activity} />
          <AudioActivityHint activity={activity} />
        </CardContent>
      </Card>
    </Link>
  )
}
