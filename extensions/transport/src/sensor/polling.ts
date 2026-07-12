/**
 * Definition 3.3 (Hybrid channel), Remark 3.2 — canon §3. Realizes S_poll,
 * the poll sub-channel of the hybrid channel.
 *
 * Re-samples a caller-supplied "holding set" of keys the event channel has
 * not yet resolved. Cadence *tuning* — when to call `poll()` — is the
 * Scheduler's concern (S8); this module only executes a re-sample when
 * told to, and hard-codes no interval of its own.
 */

import type { Token } from "../contracts/token"
import type { Epoch } from "../session/epoch"
import type { SensedToken } from "./observer"

export type HoldingSet<K> = Iterable<K>

/** Re-samples a single held key. Returns `undefined` if there is nothing new. */
export type Resampler<K, Attr> = (key: K) => Token<K, Attr> | undefined

export type PollChannelOptions<K, Attr> = {
  readonly holdingSet: () => HoldingSet<K>
  readonly resample: Resampler<K, Attr>
  readonly currentEpoch: () => Epoch
  readonly emit: (token: SensedToken<K, Attr>) => void
}

export type PollChannel = {
  /** Executes one re-sampling round; returns the number of tokens emitted. */
  poll(): number
}

export function createPollChannel<K, Attr>(
  options: PollChannelOptions<K, Attr>
): PollChannel {
  const { holdingSet, resample, currentEpoch, emit } = options

  return {
    poll(): number {
      const epoch = currentEpoch()
      let emitted = 0
      for (const key of holdingSet()) {
        const token = resample(key)
        if (token !== undefined) {
          emit({ ...token, epoch })
          emitted++
        }
      }
      return emitted
    },
  }
}
