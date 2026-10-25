/**
 * The Jobs arrival notice on the Android app (RUN5, #2068): Capacitor's push
 * notifications plugin asks Firebase Cloud Messaging for this install's
 * token, which home files to tell this phone when a morning run is in
 * (`./notice`, paulgsc/server `jobs_notice`), and a tap on the notice opens
 * Jobs.
 *
 * Every wait goes through `callForeign` (F1). A build without Firebase
 * configured (no `google-services.json`) answers `UNAVAILABLE`
 * (`patches/@capacitor__push-notifications@8.1.3.patch`), and the control is
 * withdrawn. The token is never logged: it names this install to Google.
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

/** The person said no to notifications, here or in Android's settings. */
class NotAllowedError extends Error {
  constructor() {
    super("notifications are not allowed for this app")
    this.name = "NotAllowedError"
  }
}

function classify(error: unknown): ForeignVerdict {
  if (error instanceof ForeignDeadlineError) {
    return {
      kind: "unreachable",
      retryable: true,
      summary: "Asking to be told of the morning run didn’t finish.",
    }
  }
  if (error instanceof NotAllowedError) {
    return {
      kind: "rejected",
      retryable: false,
      summary: "Notifications are off for this app.",
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

/** This install's token from FCM, asking Android's permission first. */
export const nativeNotice: NoticePort = {
  register: async (): Promise<NoticeAsked> => {
    const call = callForeign<string>({
      port: PORT,
      deadlineMs: REGISTER_DEADLINE_MS,
      start: async () => {
        const { PushNotifications } = await import(
          "@capacitor/push-notifications"
        )
        const { receive } = await PushNotifications.requestPermissions()
        if (receive !== "granted") throw new NotAllowedError()
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
          return answered.token
        } finally {
          await Promise.all(handles.map((handle) => handle.remove()))
        }
      },
    })
    const outcome = await call.outcome
    if (outcome.status === "succeeded") {
      return { kind: "token", token: outcome.value }
    }
    if (outcome.status === "abandoned") return { kind: "failed" }
    if (outcome.error.kind === "unavailable") return { kind: "unavailable" }
    if (outcome.error.kind === "rejected") return { kind: "not-allowed" }
    return { kind: "failed" }
  },
}

/** Where a tapped notice goes: the one route home's notice names. */
export const NOTICE_OPENS = "/jobs"

/** Whether a tapped notification is home's, and so opens Jobs. */
export function opensJobs(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    Reflect.get(data, "open") === NOTICE_OPENS
  )
}

let tapListening = false

/**
 * A tapped notice opens Jobs, through `go` (the router). The plugin keeps a
 * tap until a listener comes, so a cold start from the notice still lands
 * there. Installed once, on the Android app only.
 */
export function listenForNoticeTaps(
  go: (to: typeof NOTICE_OPENS) => void
): void {
  if (tapListening || !hasAudience("apk")) return
  tapListening = true
  void import("@capacitor/push-notifications").then(({ PushNotifications }) =>
    PushNotifications.addListener(
      "pushNotificationActionPerformed",
      ({ notification }) => {
        if (opensJobs(notification.data)) go(NOTICE_OPENS)
      }
    )
  )
}
