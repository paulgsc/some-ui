/**
 * The settings control for study reminders: the switch, the quiet-hours
 * window, how reminders can reach this person, and a status line naming why
 * it is currently silent (`decideNudge`'s named reason).
 *
 * The mode is stated: on the Pages build reminders arrive only while a tab is
 * open; elsewhere `file_host` delivers with the browser closed.
 *
 * Consent is asked for, not assumed: the topics are fetched from the
 * deployment (`GET /push/vapid-key`) and turning the switch on grants what is
 * ticked; the default tick is `lesson-ready`, the topic the switch describes.
 *
 * Quiet hours are read-only in server mode, and say so: `file_host` reads its
 * window from `NUDGE_QUIET_HOURS_START`/`_END` at startup with no endpoint to
 * write them, and an editable control that silently does nothing is the one
 * indefensible option.
 */

import type { ChangeEvent, JSX } from "react"
import { useEffect, useState } from "react"
import type { Intent } from "@some-ui/intent-kit"
import { matchIntent } from "@some-ui/intent-kit"
import { Input, Label, Separator, Switch } from "@some-ui/shared"
import { toast } from "sonner"

import { useAuthoritySnapshot } from "@/lib/authority"
import { DATA_MODE } from "@/lib/data-mode"
import { useAsyncIntent } from "@/lib/intent"
import { IntentButton, IntentFailure } from "@/lib/intent/render"
import type { NudgePreferences } from "@/lib/study-nudge"
import { decideNudge, SILENT_REASON_LABEL } from "@/lib/study-nudge"
import {
  fetchPushTopics,
  hasPushSubscription,
  nudgePermission,
  nudgesSupported,
  registerNudgeWorker,
  requestNudgePermission,
  showTestNudge,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/study-nudge/service-worker"
import { clientOwnsNudgeDelivery } from "@/lib/study-nudge/use-study-nudge"
import { useSessions } from "@/lib/tenant"

import { ReportingControl } from "./reporting-control"

/**
 * Words for the server's topic names. An unlabelled topic still renders under
 * its identifier: a checkbox missing from a consent list is a grant nobody
 * can withdraw.
 */
const TOPIC_LABEL: Record<string, string> = {
  "lesson-ready": "A session is prepared and waiting",
  coaching: "Coaching that follows from how sessions went",
  "new-material": "New curriculum or exercises",
}

function clampHour(raw: string, fallback: number): number {
  const value = Number.parseInt(raw, 10)
  if (Number.isNaN(value) || value < 0 || value > 23) return fallback
  return value
}

/** Named, not an inline arrow, for `react/no-unstable-nested-components`. */
function toggleFailure(state: Intent<void>): JSX.Element | null {
  return matchIntent(state, {
    idle: () => null,
    working: () => null,
    succeeded: () => null,
    failed: (error, retry) => <IntentFailure error={error} onRetry={retry} />,
  })
}

/**
 * What the policy would decide *if the app weren't on screen*: the real
 * `pageVisible` is always `true` here, which would hide the reason they came
 * to check.
 *
 * In server mode it is this browser's reading of the server's rules (it
 * cannot see the server's cooldown or snooze), labelled as such; the two
 * agree on every case in the shared fixture (`fixtures.test.ts`).
 */
const StatusLine = ({
  preferences,
  local,
}: {
  preferences: NudgePreferences
  local: boolean
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
      {local
        ? " (this browser's reading; the server decides when to send.)"
        : ""}
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
  const { reportingAllowed, backend } = useAuthoritySnapshot()
  const serverDelivers = !clientOwnsNudgeDelivery(
    DATA_MODE,
    import.meta.env.VITE_DEVICE_BACKEND === "true",
    reportingAllowed
  )

  /**
   * What the browser actually holds, not what settings claim: a subscription
   * can be revoked or dropped with nothing telling the app.
   */
  const [subscribed, setSubscribed] = useState<boolean | null>(null)

  /**
   * What this deployment will honour, fetched so the checkboxes cannot offer a
   * consent the sender ignores; empty means no push backend at all.
   */
  const [offered, setOffered] = useState<Array<string>>([])

  useEffect(() => {
    if (!serverDelivers || !supported) return
    let live = true
    void hasPushSubscription().then((has) => {
      if (live) setSubscribed(has)
    })
    void fetchPushTopics().then((topics) => {
      if (live) setOffered(topics)
    })
    return (): void => {
      live = false
    }
  }, [serverDelivers, supported, preferences.enabled])

  // Enabling is the user gesture that earns the permission prompt. A refusal
  // leaves the switch off. Every branch resolves rather than throws
  // (service-worker.ts), so `toggleIntent`'s `failed` arm is only a backstop.
  const runToggle = async (enabled: boolean): Promise<void> => {
    if (!enabled) {
      // Both ends, in server mode: dropping only the local subscription
      // leaves the server sending to a live endpoint.
      if (serverDelivers) await unsubscribeFromPush()
      setSubscribed(false)
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

    if (serverDelivers) {
      const outcome = await subscribeToPush({ topics: preferences.pushTopics })
      setSubscribed(outcome === "subscribed")
      if (outcome !== "subscribed") {
        // Reminders still turn on: without a subscription this degrades to
        // the tab-open policy rather than to nothing, and says so.
        toast("Reminders are on, but only while a tab is open", {
          description:
            outcome === "not-configured"
              ? "This deployment has no push identity configured, so it can't notify you with the browser closed."
              : "Couldn't reach file_host to register this browser for push. It will retry next time you load the app.",
        })
      }
    }

    onChange({ ...preferences, enabled: true })
  }

  const toggleIntent = useAsyncIntent(runToggle, {
    presentation: "interactive",
  })

  const runTest = async (_trigger: undefined): Promise<void> => {
    const shown = await showTestNudge({
      kind: "nudge",
      sessionId: "test",
      title: "Reminders are working",
      body: "This is what a study nudge looks like.",
    })
    if (!shown) toast("Could not show a notification - check permission.")
  }

  const testIntent = useAsyncIntent(runTest, { presentation: "interactive" })

  if (!supported) {
    return (
      <div className="space-y-2">
        <ReportingControl preferences={preferences} />
        <Label>Study reminders</Label>
        <p className="text-muted-foreground text-sm">
          {/* The likely cause on a LAN: notifications need a secure context,
              and http:// on a LAN hostname or IP is not one. */}
          This browser can&apos;t show notifications here. They need a secure
          context - use https:// or http://localhost.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Separator />

      <ReportingControl preferences={preferences} />

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
          disabled={matchIntent(toggleIntent.state, {
            idle: () => false,
            working: () => true,
            succeeded: () => false,
            failed: () => false,
          })}
          onCheckedChange={(checked: boolean) => toggleIntent.start(checked)}
        />
      </div>

      {toggleFailure(toggleIntent.state)}

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
                disabled={serverDelivers}
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
                disabled={serverDelivers}
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
            <IntentButton
              state={testIntent.state}
              onPress={() => testIntent.start(undefined)}
              variant="outline"
              size="sm"
              disabled={permission !== "granted"}
              idleLabel="Send a test"
              workingLabel="Sending..."
            />
          </div>

          {serverDelivers ? (
            <p className="text-muted-foreground text-xs">
              Quiet hours are set on the server for this deployment
              (NUDGE_QUIET_HOURS_START / _END) and shown here read-only, so this
              control cannot silently disagree with what actually decides.
            </p>
          ) : null}

          {serverDelivers && offered.length > 0 ? (
            <div className="space-y-2">
              <Label>Notify me about</Label>
              {offered.map((topic) => (
                <label
                  key={topic}
                  className="flex items-center gap-2 text-sm"
                  htmlFor={`push-topic-${topic}`}
                >
                  <input
                    id={`push-topic-${topic}`}
                    type="checkbox"
                    checked={preferences.pushTopics.includes(topic)}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      // Re-subscribing is how consent is changed: the upsert
                      // is keyed on endpoint, replacing the grant.
                      const next = e.target.checked
                        ? [...preferences.pushTopics, topic]
                        : preferences.pushTopics.filter((t) => t !== topic)
                      onChange({ ...preferences, pushTopics: next })
                      void subscribeToPush({ topics: next })
                    }}
                  />
                  {TOPIC_LABEL[topic] ?? topic}
                </label>
              ))}
              {preferences.pushTopics.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  Nothing ticked, so nothing will be sent. Reminders stay on for
                  this browser while a tab is open.
                </p>
              ) : null}
            </div>
          ) : null}

          <StatusLine preferences={preferences} local={serverDelivers} />

          <p className="text-muted-foreground text-xs">
            {serverDelivers
              ? subscribed === false
                ? "This browser isn't registered for push yet, so reminders will only arrive while a tab is open. Toggle reminders off and on to retry."
                : "Reminders arrive even with the browser closed - this browser is registered with file_host."
              : import.meta.env.VITE_DEVICE_BACKEND === "true"
                ? "Reminders come from this phone as notifications, even with the app closed. Android may deliver one a few minutes late."
                : backend === "remote"
                  ? "Reminders only fire while this app is open in a tab (it can be in the background), and are worked out on this device from your sessions. To get them with the browser closed, keep an account and turn on Reminders and progress sync."
                  : "Reminders only fire while this app is open in a tab (it can be in the background). This build has no backend to notify you with no tab open - see docs/study-nudge.md."}
          </p>
        </>
      ) : null}
    </div>
  )
}
