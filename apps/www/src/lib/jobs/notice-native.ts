/**
 * The Jobs arrival notice on the Android app (RUN5, #2068): Capacitor's push
 * notifications plugin asks Firebase Cloud Messaging for this install's
 * token, which home files to tell this phone when a morning run is in
 * (`./notice`, paulgsc/server `jobs_notice`), and a tap on the notice opens
 * Jobs. Every wait goes through `callForeign` (F1); a build without Firebase
 * answers `UNAVAILABLE` (`patches/@capacitor__push-notifications@8.1.3.patch`).
 */
import type { ForeignPort, ForeignVerdict } from "@some-ui/intent-kit"
import {
  callForeign,
  ForeignDeadlineError,
  reportFailure,
} from "@some-ui/intent-kit"

import { hasAudience } from "@/lib/build-profile"
import { isMissingPlugin } from "@/lib/intent/foreign"

import type { NoticeAsked, NoticePort } from "./runtime"

/** Android's permission prompt waits on a person; FCM answers in seconds. */
const REGISTER_DEADLINE_MS = 60_000

function classify(error: unknown): ForeignVerdict {
  if (error instanceof ForeignDeadlineError) {
    return {
      kind: "unreachable",
      retryable: true,
      summary: "Asking to be told of the morning run didn’t finish.",
    }
  }
  return isMissingPlugin(error)
    ? {
        kind: "unavailable",
        retryable: false,
        summary: "This build of the app can’t be told of the morning run.",
      }
    : {
        kind: "unknown",
        retryable: true,
        summary: "Asking to be told of the morning run didn’t work.",
      }
}

const PORT: ForeignPort = {
  name: "push notifications",
  classify,
  report: reportFailure,
}

export const nativeNotice: NoticePort = {
  register: async (): Promise<NoticeAsked> => {
    const call = callForeign<NoticeAsked>({
      port: PORT,
      deadlineMs: REGISTER_DEADLINE_MS,
      start: async () => {
        const { PushNotifications } = await import(
          "@capacitor/push-notifications"
        )
        const { receive } = await PushNotifications.requestPermissions()
        // A person's no is an answer, not a failure: nothing is reported.
        if (receive !== "granted") return { kind: "not-allowed" }
        let settle: (
          result: { token: string } | { error: Error }
        ) => void = () => undefined
        const result = new Promise<{ token: string } | { error: Error }>(
          (resolve) => {
            settle = resolve
          }
        )
        const handles = await Promise.all([
          PushNotifications.addListener("registration", ({ value }) => {
            settle({ token: value })
          }),
          PushNotifications.addListener("registrationError", ({ error }) => {
            settle({ error: new Error(error) })
          }),
        ])
        try {
          await PushNotifications.register()
          const answered = await result
          if ("error" in answered) throw answered.error
          return { kind: "token", token: answered.token }
        } finally {
          await Promise.all(handles.map((handle) => handle.remove()))
        }
      },
    })
    const outcome = await call.outcome
    if (outcome.status === "succeeded") return outcome.value
    if (outcome.status === "abandoned") return { kind: "failed" }
    if (outcome.error.kind === "unavailable") return { kind: "unavailable" }
    return { kind: "failed" }
  },
}

/** Where a tapped notice goes: the one route home's notice names. */
const NOTICE_OPENS = "/jobs"

/**
 * A tapped notice opens Jobs, through `go` (the router). The plugin keeps a
 * tap until a listener comes, so a cold start from the notice still lands
 * there. On the Android app only; `main.tsx` also guards the call, so the
 * other builds drop this module.
 */
export function listenForNoticeTaps(
  go: (to: typeof NOTICE_OPENS) => void
): void {
  if (!hasAudience("apk")) return
  void import("@capacitor/push-notifications").then(({ PushNotifications }) =>
    PushNotifications.addListener(
      "pushNotificationActionPerformed",
      ({ notification }) => {
        const { data } = notification
        const open: unknown =
          typeof data === "object" && data !== null
            ? Reflect.get(data, "open")
            : null
        if (open === NOTICE_OPENS) go(NOTICE_OPENS)
      }
    )
  )
}
