/**
 * Runs the nudge policy on a timer for as long as the app is loaded.
 *
 * ## The honest limitation
 *
 * This is a client-only trigger, so it only fires while a tab is alive —
 * backgrounded is fine, closed is not. That covers the friction actually
 * described (the dashboard sits open on a second monitor and drifts out of
 * mind) and none of the rest of it. Notifying a browser with no tab open
 * requires Web Push, which requires a VAPID keypair, a subscription store,
 * and something server-side deciding when to send; see docs/study-nudge.md.
 * `public/sw.js` already handles the `push` event for exactly that reason —
 * when the server half lands, it replaces this hook's trigger and nothing
 * else.
 *
 * Hidden tabs have their timers throttled to roughly once a minute, which
 * a five-minute interval absorbs without noticing. The interval is the only
 * driver: a `visibilitychange` listener would be the wrong one, since the
 * moment worth reacting to is "you have been away a while", not "you just
 * looked away".
 */

import { useEffect, useRef } from "react"

import { useSessions, useSettings } from "../tenant"
import type { NudgePreferences } from "./index"
import { decideNudge, DEFAULT_NUDGE_PREFERENCES } from "./index"
import {
  readLastNudgeAt,
  recordNudgeShown,
  registerNudgeWorker,
  showNudge,
} from "./service-worker"

/** Short enough that a nudge lands near the moment it becomes appropriate,
 * long enough to sit well inside a hidden tab's throttling budget. */
const POLL_INTERVAL_MS = 5 * 60_000

export function useStudyNudge(): void {
  const { data: sessions } = useSessions()
  const { data: settings } = useSettings()

  const preferences: NudgePreferences =
    settings?.notifications ?? DEFAULT_NUDGE_PREFERENCES

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
  // already installed and claimed by the time the first nudge is due.
  useEffect(() => {
    if (!preferences.enabled) return
    void registerNudgeWorker()
  }, [preferences.enabled])

  useEffect(() => {
    const tick = async (): Promise<void> => {
      const decision = decideNudge({
        sessions: sessionsRef.current ?? [],
        now: new Date(),
        pageVisible:
          typeof document === "undefined" ||
          document.visibilityState === "visible",
        lastNudgeAt: readLastNudgeAt(),
        preferences: preferencesRef.current,
      })
      if (decision.kind !== "nudge") return
      // Only stamp the cooldown for a notification that was actually
      // raised — a denied permission or a failed registration must not
      // silently burn the next few hours of eligibility.
      if (await showNudge(decision)) recordNudgeShown(new Date())
    }

    const id = window.setInterval(() => void tick(), POLL_INTERVAL_MS)
    return (): void => window.clearInterval(id)
  }, [])
}
