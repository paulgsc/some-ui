/**
 * Definition 7.2 (R-bounded delivery), §8.3 conformance checklist —
 * canon §7.
 *
 * `R` must be a single, discoverable configuration value (§8.3's
 * conformance requirement), not scattered across modules — this is that
 * one place.
 */

import type { BackoffPolicy } from "./backoff"
import type { ReconcilePolicy } from "./reconcile"

export type SchedulerConfig = {
  readonly reconcile: ReconcilePolicy
  readonly poll: BackoffPolicy
  /**
   * Definition 7.2's R: the driver's declared bound within which every
   * mutation realized at or before round t0 is guaranteed a delivered
   * token. Used by the conformance suite (S11) to assert Theorem 7.1's
   * recovery bound is actually met within it.
   */
  readonly boundedDeliveryMs: number
}

/** The single, discoverable accessor for Definition 7.2's R. */
export function declaredR(config: SchedulerConfig): number {
  return config.boundedDeliveryMs
}
