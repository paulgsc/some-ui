/**
 * Runs the nudge policy on a timer, and decides, once per build, whether
 * anything it decides may raise a notification.
 *
 * `file_host` pushes to a browser with no tab open, on its own policy (an
 * engagement level per subject that decays and is restored by signals).
 * `decideNudge` is the fallback for a build where the server is not sending,
 * not a mirror of it. Running both would *reliably* send two notifications,
 * since neither cooldown can see the other, so where the server owns delivery
 * this hook stands down (`clientOwnsNudgeDelivery`).
 *
 * Standing down is not going quiet: it still registers the worker (push needs
 * it) and reconciles the subscription on load, because the server prunes rows
 * on `410`, a browser can drop one unasked, and `sw.js` cannot reach the
 * consent a re-subscription must carry. The decision still feeds the settings
 * status line (`study-nudge-section.tsx`).
 *
 * The interval is the only driver: hidden tabs throttle timers to about once
 * a minute, which five minutes absorbs, and the moment worth reacting to is
 * "away a while", not a `visibilitychange`.
 */

import { useEffect, useRef } from "react"
import type { RuntimeMode } from "@some-ui/fetch-kit"

import { useAuthoritySnapshot } from "@/lib/authority"
import { DATA_MODE } from "@/lib/data-mode"
import { useSessions, useSettings } from "@/lib/tenant"

import type { NudgeDecision, NudgePreferences } from "./index"
import { decideNudge, DEFAULT_NUDGE_PREFERENCES } from "./index"
import {
  readLastNudgeAt,
  reconcilePushSubscription,
  recordNudgeShown,
  registerNudgeWorker,
  showNudge,
} from "./service-worker"

/** Near the moment a nudge becomes appropriate, and well inside a hidden
 * tab's throttling budget. */
const POLL_INTERVAL_MS = 5 * 60_000

/**
 * Whether this client is the one that raises notifications: with no backend
 * (`mode === "static"`), or when the server is not hearing from this learner
 * (`serverHears` false: on the device, or an account without reporting,
 * `lib/authority` "Reporting"), since the server then has nothing to base a
 * reminder on and no subscription to send to.
 *
 * The Android app also answers "yes": its backend is in-process with no push,
 * so the client's policy decides and the OS delivers (`./native`).
 */
export function clientOwnsNudgeDelivery(
  mode: RuntimeMode = DATA_MODE,
  device: boolean = import.meta.env.VITE_DEVICE_BACKEND === "true",
  serverHears = true
): boolean {
  return mode === "static" || device || !serverHears
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
 * One turn of the policy, exported so both modes can be asserted without a
 * fake timer or a DOM.
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

  // Only stamp the cooldown for a notification actually raised: a denied
  // permission must not burn the next few hours of eligibility.
  if (await deps.show(decision)) deps.record(new Date())
  return decision
}

export function useStudyNudge(): void {
  const { data: sessions } = useSessions()
  const { data: settings } = useSettings()

  const preferences: NudgePreferences =
    settings?.notifications ?? DEFAULT_NUDGE_PREFERENCES

  const { reportingAllowed } = useAuthoritySnapshot()
  const deliver = clientOwnsNudgeDelivery(
    DATA_MODE,
    import.meta.env.VITE_DEVICE_BACKEND === "true",
    reportingAllowed
  )

  // Read through refs so the interval is installed once: re-created on every
  // refetch, it would never reach its deadline. Restocked in an effect, not
  // during render, since a discarded render would leave state the user never
  // saw.
  const sessionsRef = useRef(sessions)
  const preferencesRef = useRef(preferences)

  useEffect(() => {
    sessionsRef.current = sessions
    preferencesRef.current = preferences
  })

  // Register once reminders are on, not before (an unasked background
  // download), and ahead of showing so the worker is claimed when the first
  // nudge or push arrives.
  useEffect(() => {
    if (!preferences.enabled) return
    void registerNudgeWorker()
  }, [preferences.enabled])

  // Re-post what this browser holds, with the topics it believes it agreed
  // to: an idempotent upsert that both checks and repairs, and keeps the
  // server's grant and the settings checklist from drifting apart.
  const topics = preferences.pushTopics
  useEffect(() => {
    if (deliver || !preferences.enabled) return
    void reconcilePushSubscription({ topics })
  }, [deliver, preferences.enabled, topics])

  useEffect(() => {
    // Nothing to poll in server mode: the notification would be the
    // duplicate. The settings page computes its own decision on demand.
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

  useNativeNudgeSchedule(sessionsRef, preferencesRef)
}

/**
 * The Android app's half: a timer cannot run with the app off screen, so
 * the next nudge is handed to the OS on the way out and taken back on the
 * way in (`./native`, `./schedule`). A no-op in every other build.
 */
function useNativeNudgeSchedule(
  sessionsRef: {
    readonly current: Parameters<typeof decideNudge>[0]["sessions"] | undefined
  },
  preferencesRef: { readonly current: NudgePreferences }
): void {
  useEffect(() => {
    if (import.meta.env.VITE_DEVICE_BACKEND !== "true") return undefined
    let cancelled = false

    const onVisibility = async (): Promise<void> => {
      const native = await import("./native")
      if (cancelled) return
      if (document.visibilityState === "visible") {
        await native.reconcileNativeNudge(new Date())
        return
      }
      const { nextNudge } = await import("./schedule")
      await native.scheduleNativeNudge(
        nextNudge(
          {
            sessions: sessionsRef.current ?? [],
            preferences: preferencesRef.current,
            lastNudgeAt: readLastNudgeAt(),
          },
          new Date()
        )
      )
    }

    void import("./native").then(async (native) => {
      if (cancelled) return
      native.listenForNudgeTaps()
      await native.refreshNativePermission()
      await native.reconcileNativeNudge(new Date())
    })
    const listener = (): void => void onVisibility()
    document.addEventListener("visibilitychange", listener)
    return (): void => {
      cancelled = true
      document.removeEventListener("visibilitychange", listener)
    }
  }, [sessionsRef, preferencesRef])
}
