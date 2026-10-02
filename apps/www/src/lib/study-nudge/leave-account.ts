import { authority } from "@/lib/authority"

import { dropLocalPushSubscription } from "./service-worker"

/**
 * When the learner's data stops being the account's, release this browser's
 * push subscription locally (`dropLocalPushSubscription`).
 *
 * Without it, a browser that was subscribed while signed in keeps a live
 * endpoint after the person leaves: the server keeps sending reminders for an
 * account they have left, and the service worker keeps talking to the server
 * about the endpoint whenever the browser rotates it. Doing it on the change
 * itself, outside any component, means it happens whichever screen the person
 * was on, and also when a session simply expires.
 *
 * Returns the unsubscribe function, so a test can remove it.
 */
export function releasePushWhenLeavingTheAccount(): () => void {
  return authority.onAuthorityChange((next) => {
    if (next.kind !== "account") void dropLocalPushSubscription()
  })
}
