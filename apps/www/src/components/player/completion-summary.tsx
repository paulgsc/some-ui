import type { JSX } from "react"
import {
  getActivityByRegistryKey,
  summarizeConfig,
} from "@some-ui/activity-catalog"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@some-ui/shared"
import { Link, useNavigate } from "@tanstack/react-router"
import { Check, Mic, RotateCcw, StopCircle } from "lucide-react"

import { hasAudience } from "@/lib/build-profile"
import { formatDurationMs } from "@/lib/format"
import { useIntent, useIntentEffect } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import type { SessionRecord } from "@/lib/tenant"
import { useDuplicateSession } from "@/lib/tenant"
import { leadMs } from "@/lib/wind-down"
import { ActivityIcon } from "@/components/activity-icon"

import { SessionReflection } from "./session-reflection"

type CompletionSummaryProps = {
  session: SessionRecord
}

export const CompletionSummary = ({
  session,
}: CompletionSummaryProps): JSX.Element => {
  const navigate = useNavigate()
  const replayIntent = useIntent(useDuplicateSession(), {
    presentation: "interactive",
  })
  const finalElapsedMs = session.finalElapsedMs ?? session.totalDurationMs
  // "Wrap up" from the wind-down nudge is a finish too, not a stop.
  const finishedNaturally =
    finalElapsedMs >= session.totalDurationMs - leadMs(session.totalDurationMs)
  const addedMs = finalElapsedMs - session.totalDurationMs
  const phone = hasAudience("apk")

  // Replay hands the player a fresh draft copy and drops them into the
  // composer's Configure step, where everything is still editable.
  useIntentEffect(replayIntent.state, (copy) => {
    void navigate({ to: "/sessions/new", search: { edit: copy.id } })
  })

  const handleReplay = (): void => {
    replayIntent.start(session.id)
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {finishedNaturally ? (
              <span className="bg-success text-success-foreground animate-in zoom-in-50 flex size-8 items-center justify-center rounded-full duration-500">
                <Check className="size-5" strokeWidth={3} aria-hidden />
              </span>
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
              <p className="text-muted-foreground text-sm">You added</p>
              <p
                className={
                  addedMs > 0 ? "text-success font-semibold" : "font-semibold"
                }
              >
                {addedMs > 0 ? `+${formatDurationMs(addedMs)}` : "none"}
              </p>
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

          <SessionReflection sessionId={session.id} />

          {phone && (
            <div className="space-y-1">
              <Button asChild variant="outline" className="h-11 w-full">
                <Link to="/soundbites" search={{ say: "wrap" }}>
                  <Mic className="mr-2 size-4" aria-hidden />
                  Say what stuck
                </Link>
              </Button>
              <p className="text-muted-foreground text-center text-xs">
                Up to a minute, out loud. Kept on this phone.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Badge variant="outline">Completed</Badge>
        <div className="ml-auto flex items-center gap-2">
          <IntentButton
            state={replayIntent.state}
            onPress={handleReplay}
            variant="outline"
            idleLabel={
              <>
                <RotateCcw className="mr-1.5 size-3.5" />
                Play again
              </>
            }
            workingLabel="Replaying..."
          />
          {phone ? (
            <Button asChild>
              <Link to="/today">Done</Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link to="/sessions">Back to sessions</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
