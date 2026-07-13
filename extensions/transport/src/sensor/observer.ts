/**
 * Definition 3.1 (Token), Definition 3.2 (Observation channel), Axioms
 * 3.1–3.5 — canon §3. Realizes S_event, the event sub-channel of the
 * hybrid channel (Definition 3.3).
 *
 * Wraps `MutationObserver`/DOM events into epoch-tagged Tokens. This module
 * performs no interpretation of token content — no identity extraction
 * (that is S5, `identity.ts`) — and no DOM mutation. It only produces
 * tokens; the Estimator (S6) decides what they mean.
 */

import type { Token } from "../contracts/token"
import type { Epoch } from "../session/epoch"

export type SensedToken<K, Attr> = Token<K, Attr> & { readonly epoch: Epoch }

/**
 * Maps a raw event-channel payload (a `MutationRecord`, a DOM `Event`, or
 * any vendor-agnostic equivalent) to zero or more Tokens. Injected rather
 * than hard-coded: this module has no opinion on what a payload means.
 */
export type TokenProducer<Raw, K, Attr> = (
  raw: Raw
) => ReadonlyArray<Token<K, Attr>>

/**
 * Axiom 3.5 (Actuator re-entrance): a predicate excluding actuator-authored
 * mutations from producing tokens in the first place. This module defines
 * no tag scheme of its own — the predicate is supplied by whatever
 * Adapter/Actuator pairing (S9) uses this channel.
 */
export type SelfAuthoredPredicate<Raw> = (raw: Raw) => boolean

export type EventChannelOptions<Raw, K, Attr> = {
  readonly toTokens: TokenProducer<Raw, K, Attr>
  readonly currentEpoch: () => Epoch
  readonly isSelfAuthored?: SelfAuthoredPredicate<Raw>
  readonly emit: (token: SensedToken<K, Attr>) => void
}

export type EventChannel<Raw> = {
  ingest(raw: Raw): void
}

export function createEventChannel<Raw, K, Attr>(
  options: EventChannelOptions<Raw, K, Attr>
): EventChannel<Raw> {
  const { toTokens, currentEpoch, isSelfAuthored, emit } = options

  return {
    ingest(raw: Raw): void {
      if (isSelfAuthored?.(raw) === true) {
        return
      }
      const epoch = currentEpoch()
      for (const token of toTokens(raw)) {
        emit({ ...token, epoch })
      }
    },
  }
}

/** Attaches a `MutationObserver` to `target`, feeding every record into `channel`. */
export function attachMutationObserver(
  target: Node,
  channel: EventChannel<MutationRecord>,
  observerOptions: MutationObserverInit
): () => void {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      channel.ingest(record)
    }
  })
  observer.observe(target, observerOptions)
  return () => observer.disconnect()
}

/**
 * Attaches a DOM event listener to `target`, feeding every event into
 * `channel`. `channel` is typed over the base `Event` — a caller needing a
 * more specific event shape narrows it (e.g. `instanceof`) inside its own
 * `toTokens`, rather than this module asserting a type it cannot verify.
 */
export function attachDomEventListener(
  target: EventTarget,
  type: string,
  channel: EventChannel<Event>,
  listenerOptions?: AddEventListenerOptions
): () => void {
  const listener = (event: Event): void => channel.ingest(event)
  target.addEventListener(type, listener, listenerOptions)
  return () => target.removeEventListener(type, listener, listenerOptions)
}
