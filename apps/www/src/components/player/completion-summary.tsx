import type { JSX } from "react"
import { Link } from "@tanstack/react-router"
import { CheckCircle2, StopCircle } from "lucide-react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "some-ui-shared"

import { getActivityByRegistryKey } from "@/lib/activity-catalog"
import { formatDurationMs } from "@/lib/format"
import type { SessionRecord } from "@/lib/tenant"
import { ActivityIcon } from "@/components/activity-icon"
import { summarizeConfig } from "@/components/composer/utils"

type CompletionSummaryProps = {
  session: SessionRecord
}

export const CompletionSummary = ({
  session,
}: CompletionSummaryProps): JSX.Element => {
  const finalElapsedMs = session.finalElapsedMs ?? session.totalDurationMs
  const finishedNaturally = finalElapsedMs >= session.totalDurationMs

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {finishedNaturally ? (
              <CheckCircle2 className="text-primary size-6" />
            ) : (
              <StopCircle className="text-muted-foreground size-6" />
            )}
            <CardTitle>
              {finishedNaturally ? "Session complete" : "Session stopped early"}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-muted-foreground text-sm">Time played</p>
              <p className="font-semibold">
                {formatDurationMs(finalElapsedMs)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Planned</p>
              <p className="font-semibold">
                {formatDurationMs(session.totalDurationMs)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Activities</p>
              <p className="font-semibold">{session.activities.length}</p>
            </div>
          </div>

          <div className="space-y-3">
            {session.scenes.map((scene, index) => {
              const registryKey =
                scene.ui.at(0)?.panels?.mainContent.registry_key
              const activity = registryKey
                ? getActivityByRegistryKey(registryKey)
                : undefined
              const sourceActivity = session.activities.at(index)
              return (
                <div key={scene.scene_name} className="flex items-center gap-3">
                  <span className="bg-muted flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                    {index + 1}
                  </span>
                  {activity && (
                    <ActivityIcon
                      icon={activity.icon}
                      className="text-primary size-5 shrink-0"
                    />
                  )}
                  <div>
                    <p className="font-medium">
                      {activity?.name ?? scene.scene_name}
                    </p>
                    {activity && sourceActivity && (
                      <p className="text-muted-foreground text-sm">
                        {summarizeConfig(activity, sourceActivity.config)}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-muted-foreground text-xs">
            Detailed per-activity results (accuracy, score, etc.) are not yet
            wired up for every activity - this summary reflects session timing
            only.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Badge variant="outline">Completed</Badge>
        <Button asChild variant="outline" className="ml-auto">
          <Link to="/sessions">Back to sessions</Link>
        </Button>
      </div>
    </div>
  )
}
