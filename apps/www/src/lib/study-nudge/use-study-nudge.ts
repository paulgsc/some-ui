/**
 * Runs the nudge policy on a timer, and decides — once per build — whether
 * anything it decides is allowed to raise a notification.
 *
 * ## Two policies, one person
 *
 * #907's limitation is gone. `file_host` now holds the sessions, ports
 * `decideNudge` verbatim, ticks every fifteen minutes, and pushes to a
 * browser with no tab open — the thing this hook could never do. But it
 * does not *replace* this hook, because the two deployments are not the
 * same:
 *
 * - The **GitHub Pages** build (`DATA_MODE === "static"`) has no backend at
 *   all. This hook is the only policy there is, and it behaves exactly as
 *   it did in #907.
 * - **Everywhere else** the server owns delivery, and this hook stands
 *   down.
 *
 * Running both is not "occasionally two notifications", it is *reliably*
 * two on any day that earns one: this hook's cooldown lives in
 * `localStorage` and the server's in `nudge_log`, and neither can see the
 * other. For a feature whose entire value proposition is not being
 * annoying, that would make the product worse than #907 alone — which is
 * why this file changes in the same release as the subscription that makes
 * the server able to send.
 *
 * ## Standing down is not going quiet
 *
 * In server mode this hook still registers the worker (push needs it) and
 * still reconciles the subscription on load (the server prunes rows on
 * `410` and the browser can drop one unasked). It just does not raise
 * anything. The *decision* also keeps running where it is useful — the
 * settings status line — because "You've already studied today." is worth
 * saying whoever is doing the sending; see `study-nudge-section.tsx`,
 * where it is labelled as this browser's own reading rather than the
 * server's answer.
 *
 * Hidden tabs have their timers throttled to roughly once a minute, which
 * a five-minute interval absorbs without noticing. The interval is the only
 * driver: a `visibilitychange` listener would be the wrong one, since the
 * moment worth reacting to is "you have been away a while", not "you just
 * looked away".
 */

import { useEffect, useRef } from "react"
import type { RuntimeMode } from "@some-ui/fetch-kit"

import { DATA_MODE } from "../data-mode"
import { useSessions, useSettings } from "../tenant"
import type { NudgeDecision, NudgePreferences } from "./index"
import { decideNudge, DEFAULT_NUDGE_PREFERENCES } from "./index"
import {
  readLastNudgeAt,
  reconcilePushSubscription,
  recordNudgeShown,
  registerNudgeWorker,
  showNudge,
} from "./service-worker"

/** Short enough that a nudge lands near the moment it becomes appropriate,
 * long enough to sit well inside a hidden tab's throttling budget. */
const POLL_INTERVAL_MS = 5 * 60_000

/**
 * Whether this build's client is the one that raises notifications.
 *
 * The same bit `sessions-backend.ts` uses to pick a store picks the
 * trigger, and for the same underlying reason: it is the answer to "is
 * there a backend here".
 */
export function clientOwnsNudgeDelivery(
  mode: RuntimeMode = DATA_MODE
): boolean {
  return mode === "static"
}

export type NudgeTickDeps = {
  sessions: Parameters<typeof decideNudge>[0]["sessions"]
  preferences: NudgePreferences
  now: Date
  pageVisible: boolean
  lastNudgeAt: string | null
  /** False in server mode: decide, but do not raise. */
  deliver: boolean
  show: (
    decision: Extract<NudgeDecision, { kind: "nudge" }>
  ) => Promise<boolean>
  record: (at: Date) => void
}

/**
 * One turn of the policy. Exported so both modes can be asserted without a
 * fake timer or a DOM: the interesting property is that `show` is called in
 * one and not the other, and that is a property of this function.
 */
export async function runNudgeTick(
  deps: NudgeTickDeps
): Promise<NudgeDecision> {
  const decision = decideNudge({
    sessions: deps.sessions,
    now: deps.now,
    pageVisible: deps.pageVisible,
    lastNudgeAt: deps.lastNudgeAt,
    preferences: deps.preferences,
  })

  if (decision.kind !== "nudge") return decision
  if (!deps.deliver) return decision

  // Only stamp the cooldown for a notification that was actually raised —
  // a denied permission or a failed registration must not silently burn
  // the next few hours of eligibility.
  if (await deps.show(decision)) deps.record(new Date())
  return decision
}

export function useStudyNudge(): void {
  const { data: sessions } = useSessions()
  const { data: settings } = useSettings()

  const preferences: NudgePreferences =
    settings?.notifications ?? DEFAULT_NUDGE_PREFERENCES

  const deliver = clientOwnsNudgeDelivery()

  // The interval callback reads the latest sessions and preferences through
  // refs rather than closing over them, so it is installed once instead of
  // being torn down and rebuilt on every sessions refetch — a re-created
  // interval never reaches its own deadline.
  const sessionsRef = useRef(sessions)
  const preferencesRef = useRef(preferences)

  // Restocked in an effect rather than assigned during render: a render can
  // be discarded or replayed, and a ref written on a render that never
  // commits leaves the interval reading state the user never saw.
  useEffect(() => {
    sessionsRef.current = sessions
    preferencesRef.current = preferences
  })

  // Register as soon as reminders are on, and not before: an unrequested
  // worker registration on a first visit is a background download nobody
  // asked for. Registration is separate from showing so the worker is
  // already installed and claimed by the time the first nudge is due — and
  // in server mode it is the thing that receives the push at all.
  useEffect(() => {
    if (!preferences.enabled) return
    void registerNudgeWorker()
  }, [preferences.enabled])

  // The client's half of the subscription conversation. The server prunes a
  // row on `410` from the push service, and a browser can drop a
  // subscription unasked; re-posting what this browser holds is both the
  // check and the repair, and it is an idempotent upsert either way.
  useEffect(() => {
    if (deliver || !preferences.enabled) return
    void reconcilePushSubscription()
  }, [deliver, preferences.enabled])

  useEffect(() => {
    // Nothing to poll for in server mode: the decision this would compute
    // is not used, and the notification it would raise is the duplicate
    // this whole story exists to prevent. The settings page computes its
    // own on demand for the status line.
    if (!deliver) return undefined

    const tick = async (): Promise<void> => {
      await runNudgeTick({
        sessions: sessionsRef.current ?? [],
        preferences: preferencesRef.current,
        now: new Date(),
        pageVisible:
          typeof document === "undefined" ||
          document.visibilityState === "visible",
        lastNudgeAt: readLastNudgeAt(),
        deliver: true,
        show: showNudge,
        record: recordNudgeShown,
      })
    }

    const id = window.setInterval(() => void tick(), POLL_INTERVAL_MS)
    return (): void => window.clearInterval(id)
  }, [deliver])
}
