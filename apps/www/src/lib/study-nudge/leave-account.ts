import { authority } from "@/lib/authority"

import { dropLocalPushSubscription } from "./service-worker"

/**
 * When the server stops being someone this learner reports to, release this
 * browser's push subscription locally (`dropLocalPushSubscription`): their
 * data stopped being the account's (they left it, or its session ended), or
 * they turned reporting off, or another account signed in and has not agreed
 * to anything.
 *
 * Without it, a browser that was subscribed keeps a live endpoint after the
 * person leaves: the server keeps sending reminders for an account they have
 * left, and the service worker keeps talking to the server about the endpoint
 * whenever the browser rotates it. Doing it on the change itself, outside any
 * component, means it happens whichever screen the person was on, and also
 * when a session simply expires.
 *
 * Returns the unsubscribe function, so a test can remove it.
 */
export function releasePushWhenLeavingTheAccount(): () => void {
  let before = authority.getSnapshot()
  return authority.subscribe(() => {
    const now = authority.getSnapshot()
    const leftTheAccount =
      before.authority.kind === "account" && now.authority.kind !== "account"
    const stoppedReporting = before.reportingAllowed && !now.reportingAllowed
    before = now
    if (leftTheAccount || stoppedReporting) void dropLocalPushSubscription()
  })
}
