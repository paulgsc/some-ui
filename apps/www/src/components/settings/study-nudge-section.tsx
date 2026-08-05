/**
 * The settings control for study reminders.
 *
 * Four things share this section because they are one question a person is
 * actually asking - "will this thing interrupt me, and when": the switch,
 * the quiet-hours window, a line saying *how* it can reach them, and a
 * status line naming why it is currently silent. That last one is the
 * reason `decideNudge` returns a named reason rather than a bare boolean: a
 * reminder feature whose failure mode is "nothing happens" is untrustworthy,
 * and the fix is to always be able to say which rule is in force right now.
 *
 * ## Two deployments, and the UI has to say which one this is
 *
 * On the GitHub Pages build the client is the whole feature and reminders
 * arrive only while a tab is open. Everywhere else `file_host` owns
 * delivery and they arrive with the browser closed. Those are materially
 * different promises to make to someone, and "reminders are on" means a
 * different thing in each - so the mode is stated rather than left to be
 * discovered.
 *
 * ## Consent is asked for, not assumed
 *
 * A subscription carries the topics it is permitted to deliver, and the
 * server honours an empty list as "receives nothing" rather than reading it
 * as "receives everything". So the topics are a control here rather than a
 * constant: the list is fetched from the deployment (`GET /push/vapid-key`
 * returns it beside the key) so the checkboxes are what the sender will
 * actually honour, and turning the switch on grants what is ticked. The
 * default tick is `lesson-ready` and only that, because it is the topic the
 * switch's own words describe.
 *
 * ## Quiet hours are read-only in server mode, and say so
 *
 * The seam is genuinely awkward and the honest options were: disable the
 * controls with an explanation, or send the preferences to the server.
 * Disabled won, because sending them is not the small change it looks
 * like - `file_host` reads its window from `NUDGE_QUIET_HOURS_START`/`_END`
 * at startup, there is no endpoint to write them, and a per-browser
 * preference overriding a server-wide environment variable is a design
 * decision with more than one defensible answer. What is *not* defensible
 * is the third option: leaving an editable control that silently does
 * nothing, so that someone sets 23->7 and gets nudged at 22:30 anyway. The
 * endpoint is the follow-up; the disabled control with a reason is this
 * story's answer.
 */

import type { ChangeEvent, JSX } from "react"
import { useEffect, useState } from "react"
import { Button, Input, Label, Separator, Switch } from "@some-ui/shared"
import { toast } from "sonner"

import type { NudgePreferences } from "@/lib/study-nudge"
import { decideNudge, SILENT_REASON_LABEL } from "@/lib/study-nudge"
import {
  fetchPushTopics,
  hasPushSubscription,
  nudgePermission,
  nudgesSupported,
  registerNudgeWorker,
  requestNudgePermission,
  showNudge,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/study-nudge/service-worker"
import { clientOwnsNudgeDelivery } from "@/lib/study-nudge/use-study-nudge"
import { useSessions } from "@/lib/tenant"

/**
 * Words for the server's topic names. A topic this build has no label for
 * still renders - under its own identifier - rather than being hidden: a
 * checkbox missing from a consent list is a grant nobody can withdraw.
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

/**
 * What the policy would decide *if the app weren't on screen*. The real
 * `pageVisible` is necessarily `true` while someone is reading this page,
 * so passing it through would make the status row permanently say "you're
 * looking at the app right now" - true, useless, and hiding the reason
 * they came here to check.
 *
 * In server mode this is this browser's own reading of the same rules the
 * server runs, not the server's answer - it cannot see the server's
 * cooldown or its snooze. It is labelled that way rather than dressed up as
 * authoritative: asking the server for its current decision needs an
 * endpoint that does not exist, and the two agree on every case in the
 * shared fixture (see `fixtures.test.ts`), so a local reading is honest.
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
  const serverDelivers = !clientOwnsNudgeDelivery()

  /**
   * What the browser actually holds, not what settings claim.
   *
   * A subscription can be revoked in browser settings, or dropped by the
   * browser under storage pressure, with nothing telling the app. Reading
   * `preferences.enabled` alone would then leave this page insisting
   * reminders are on for a browser that will never receive one - which is
   * the failure this feature can least afford, because its healthy state
   * also looks like nothing happening.
   */
  const [subscribed, setSubscribed] = useState<boolean | null>(null)

  /**
   * What this deployment will actually honour. Fetched rather than listed
   * here so the checkboxes cannot offer a consent the sender ignores; an
   * empty result means there is no push backend to consent to at all.
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

  // Enabling is the user gesture that earns the permission prompt, so the
  // request happens here and nowhere else. A refusal leaves the switch off
  // rather than storing an "on" that can never fire.
  const handleToggle = async (enabled: boolean): Promise<void> => {
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
        // exactly #907's behaviour rather than to nothing, and saying so is
        // the difference between a known limitation and a broken feature.
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleTest()}
              disabled={permission !== "granted"}
            >
              Send a test
            </Button>
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
                      // Re-subscribing is how consent is *changed*: the
                      // upsert is keyed on endpoint, so posting the new
                      // list replaces the grant rather than adding a row.
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
                  {/* An empty list is a real answer and the server honours
                      it as silence. Saying so beats a person concluding
                      later that reminders are broken. */}
                  Nothing ticked, so nothing will be sent. Reminders stay on for
                  this browser while a tab is open.
                </p>
              ) : null}
            </div>
          ) : null}

          <StatusLine preferences={preferences} local={serverDelivers} />

          <p className="text-muted-foreground text-xs">
            {/* "Reminders are on" means two different things across the two
                deployments, and the difference is the entire point of the
                server half. Say which one this is. */}
            {serverDelivers
              ? subscribed === false
                ? "This browser isn't registered for push yet, so reminders will only arrive while a tab is open. Toggle reminders off and on to retry."
                : "Reminders arrive even with the browser closed - this browser is registered with file_host."
              : "Reminders only fire while this app is open in a tab (it can be in the background). This build has no backend to notify you with no tab open - see docs/study-nudge.md."}
          </p>
        </>
      ) : null}
    </div>
  )
}
