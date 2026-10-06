/**
 * The one switch that lets an account hear about a learner's behaviour:
 * "Reminders and progress sync" (canon Remark 7.6). On, this browser tells the
 * server which session is open, when the person studies and which browser to
 * wake, so reminders arrive with the browser closed. Off, none of that is
 * sent, and reminders appear only while a tab is open.
 *
 * Shown only for a remote account (the device, the demo and the Android
 * backend send nothing). Off ends the push subscription at both ends *before*
 * the setting flips, while the transport is still allowed; what the server
 * already holds stays until deleted, and the copy says so.
 */

import type { JSX } from "react"
import { Label, Switch } from "@some-ui/shared"
import { toast } from "sonner"

import { useAuthoritySnapshot } from "@/lib/authority"
import { useAsyncIntent } from "@/lib/intent"
import type { NudgePreferences } from "@/lib/study-nudge"
import { setReporting } from "@/lib/study-nudge/reporting"

export const ReportingControl = ({
  preferences,
}: {
  preferences: NudgePreferences
}): JSX.Element | null => {
  const snapshot = useAuthoritySnapshot()

  const intent = useAsyncIntent(
    (on: boolean) =>
      setReporting(on, preferences, {
        notRegistered: () => {
          toast(
            "Progress sync is on, but this browser isn't registered for push",
            {
              description:
                "Reminders will only appear while a tab is open. It will retry next time you load the app.",
            }
          )
        },
      }),
    { presentation: "interactive" }
  )

  if (snapshot.backend !== "remote" || snapshot.authority.kind !== "account") {
    return null
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor="reporting">Reminders and progress sync</Label>
        <p className="text-muted-foreground text-sm">
          Lets your account send you reminders with the browser closed. When
          this is on, this browser tells the server which session you have open
          and when you start and finish them, and registers itself for push.
          When it is off, none of that is sent and reminders only appear while a
          tab is open. Turning it off does not erase what the server already
          holds; deleting your account does.
        </p>
      </div>
      <Switch
        id="reporting"
        checked={snapshot.reporting}
        onCheckedChange={(on: boolean) => intent.start(on)}
      />
    </div>
  )
}
