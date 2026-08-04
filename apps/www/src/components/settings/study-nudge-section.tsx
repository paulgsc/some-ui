/**
 * The settings control for study reminders.
 *
 * Three things share this section because they are one question a person is
 * actually asking - "will this thing interrupt me, and when": the switch,
 * the quiet-hours window, and a status line naming why it is currently
 * silent. That last one is the reason `decideNudge` returns a named reason
 * rather than a bare boolean: a reminder feature whose failure mode is
 * "nothing happens" is untrustworthy, and the fix is to always be able to
 * say which rule is in force right now.
 */

import type { ChangeEvent, JSX } from "react"
import { Button, Input, Label, Separator, Switch } from "@some-ui/shared"
import { toast } from "sonner"

import type { NudgePreferences } from "@/lib/study-nudge"
import { decideNudge, SILENT_REASON_LABEL } from "@/lib/study-nudge"
import {
  nudgePermission,
  nudgesSupported,
  registerNudgeWorker,
  requestNudgePermission,
  showNudge,
} from "@/lib/study-nudge/service-worker"
import { useSessions } from "@/lib/tenant"

function clampHour(raw: string, fallback: number): number {
  const value = Number.parseInt(raw, 10)
  if (Number.isNaN(value) || value < 0 || value > 23) return fallback
  return value
}

/**
 * What the policy would decide *if the app weren't on screen*. The real
 * `pageVisible` is necessarily `true` while someone is reading this page,
 * so passing it through would make the status row permanently say "you're
 * looking at the app right now" - true, useless, and hiding the reason
 * they came here to check.
 */
const StatusLine = ({
  preferences,
}: {
  preferences: NudgePreferences
}): JSX.Element => {
  const { data: sessions } = useSessions()

  const decision = decideNudge({
    sessions: sessions ?? [],
    now: new Date(),
    pageVisible: false,
    lastNudgeAt: null,
    preferences,
  })

  return (
    <p className="text-muted-foreground text-sm">
      {decision.kind === "nudge"
        ? `Ready to remind you about "${decision.body.split(" · ")[0]}" once you're away.`
        : SILENT_REASON_LABEL[decision.reason]}
    </p>
  )
}

export const StudyNudgeSection = ({
  preferences,
  onChange,
}: {
  preferences: NudgePreferences
  onChange: (next: NudgePreferences) => void
}): JSX.Element => {
  const supported = nudgesSupported()
  const permission = nudgePermission()

  // Enabling is the user gesture that earns the permission prompt, so the
  // request happens here and nowhere else. A refusal leaves the switch off
  // rather than storing an "on" that can never fire.
  const handleToggle = async (enabled: boolean): Promise<void> => {
    if (!enabled) {
      onChange({ ...preferences, enabled: false })
      return
    }

    const granted = await requestNudgePermission()
    if (granted !== "granted") {
      toast("Reminders need notification permission", {
        description:
          granted === "denied"
            ? "Your browser has blocked notifications for this site. Re-allow them in site settings, then try again."
            : "The permission prompt was dismissed.",
      })
      return
    }

    await registerNudgeWorker()
    onChange({ ...preferences, enabled: true })
  }

  const handleTest = async (): Promise<void> => {
    const shown = await showNudge({
      kind: "nudge",
      sessionId: "test",
      title: "Reminders are working",
      body: "This is what a study nudge looks like.",
    })
    if (!shown) toast("Could not show a notification - check permission.")
  }

  if (!supported) {
    return (
      <div className="space-y-2">
        <Label>Study reminders</Label>
        <p className="text-muted-foreground text-sm">
          {/* The overwhelmingly likely cause on this app's own LAN setup, so
              it is worth naming rather than shrugging: service workers and
              notifications need a secure context, and http:// on a LAN
              hostname or IP is not one (http://localhost is the exception). */}
          This browser can&apos;t show notifications here. They need a secure
          context - use https:// or http://localhost.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Separator />

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="study-reminders">Study reminders</Label>
          <p className="text-muted-foreground text-sm">
            Nudge me to come back when a session is prepared and I haven&apos;t
            studied today.
          </p>
        </div>
        <Switch
          id="study-reminders"
          checked={preferences.enabled}
          onCheckedChange={(checked: boolean) => void handleToggle(checked)}
        />
      </div>

      {preferences.enabled ? (
        <>
          <div className="flex items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="quiet-start">Quiet from</Label>
              <Input
                id="quiet-start"
                type="number"
                min={0}
                max={23}
                className="w-20"
                value={preferences.quietHoursStart}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  onChange({
                    ...preferences,
                    quietHoursStart: clampHour(
                      e.target.value,
                      preferences.quietHoursStart
                    ),
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quiet-end">until</Label>
              <Input
                id="quiet-end"
                type="number"
                min={0}
                max={23}
                className="w-20"
                value={preferences.quietHoursEnd}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  onChange({
                    ...preferences,
                    quietHoursEnd: clampHour(
                      e.target.value,
                      preferences.quietHoursEnd
                    ),
                  })
                }
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleTest()}
              disabled={permission !== "granted"}
            >
              Send a test
            </Button>
          </div>

          <StatusLine preferences={preferences} />

          <p className="text-muted-foreground text-xs">
            {/* Stated plainly rather than left to be discovered: this is the
                one thing about the feature that will otherwise read as a bug. */}
            Reminders only fire while this app is open in a tab (it can be in
            the background). Notifying you with no tab open needs the push
            service - see docs/study-nudge.md.
          </p>
        </>
      ) : null}
    </div>
  )
}
