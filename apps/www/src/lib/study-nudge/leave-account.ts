import type { AuthoritySnapshot } from "@/lib/authority"
import { authority } from "@/lib/authority"

import { dropLocalPushSubscription } from "./service-worker"

/**
 * When the server stops being someone this learner reports to (they left the
 * account, its session ended, reporting turned off, or another account signed
 * in), release this browser's push subscription locally
 * (`dropLocalPushSubscription`), or the server keeps sending reminders for an
 * account they left. Done on the change, outside any component, so it also
 * covers an expiry on any screen. Returns the unsubscribe function.
 */
export function releasePushWhenLeavingTheAccount(): () => void {
  /**
   * Whether the server may hold a subscription for this browser. While
   * `pending`, the previous load's opt-in says so; a probe that finds the
   * session gone is the departure.
   */
  const mayHold = (snapshot: AuthoritySnapshot): boolean =>
    snapshot.reportingAllowed ||
    (snapshot.authority.kind === "pending" && snapshot.reporting)

  let before = authority.getSnapshot()
  return authority.subscribe(() => {
    const now = authority.getSnapshot()
    const leftTheAccount =
      before.authority.kind === "account" && now.authority.kind !== "account"
    // `pending` is not an answer: a subscription stays until the check says.
    const stoppedReporting =
      mayHold(before) && !mayHold(now) && now.authority.kind !== "pending"
    before = now
    if (leftTheAccount || stoppedReporting) void dropLocalPushSubscription()
  })
}
