/**
 * Identity reconciliation (BC2, #1435) — canon Definition 4.1 and Corollary
 * 4.1.1, as the Sensor's own bookkeeping.
 *
 * Which element carries which card, and the other way round. Core keys by
 * artifact (B2), so this is where "the same node now shows a different
 * video" (a recycle) is told apart from "the same video's subtree churned
 * under us" (#1423), and where the elements a key names are kept for the
 * runtime to bind onto the Actuator's actions.
 *
 * Nothing here is a Core type: `HTMLElement` appears freely, because this
 * *is* the shell.
 */

import type {
  CustodyRole,
  CustodyTarget,
} from "@censor/lib/content/actuator/bound"
import type { CardKey } from "@censor/lib/content/core/keys"
import { cardKey, keyVideoId } from "@censor/lib/content/core/keys"
import { representsVideo } from "@censor/lib/content/extract/index"
import { asVideoId } from "@censor/types/ids"
import type { VideoId } from "@censor/types/ids"

export type Reconciliation =
  /** First sighting of this element as a card. */
  | { readonly kind: "new"; readonly key: CardKey }
  /** Same element, same card. */
  | { readonly kind: "same"; readonly key: CardKey }
  /**
   * The element still advertises the artifact it was mounted for; whatever
   * extraction returned first is vendor churn (a preview anchor, a swapped
   * row). The card keeps its key (#1423).
   */
  | { readonly kind: "churn"; readonly key: CardKey }
  /** The element now shows a different artifact. */
  | {
      readonly kind: "recycled"
      readonly key: CardKey
      readonly previous: CardKey
      /** `true` when no other element carries `previous` any more. */
      readonly previousGone: boolean
    }

export type Identity = {
  /** Reconcile `el` against the videoId just extracted from it. */
  reconcile(el: HTMLElement, videoId: VideoId): Reconciliation
  /** `el` no longer carries a card. Returns the key it carried, if it is now carried by nothing. */
  release(el: HTMLElement): { key: CardKey; gone: boolean } | null
  /** The elements currently carrying `key`, anchors first. */
  custodyOf(key: CardKey): ReadonlyArray<CustodyTarget>
  /** Add an element as nested custody of `key` (no veil; stamp only). */
  addNested(key: CardKey, el: HTMLElement): void
  /** The key an element carries, if any. */
  keyOf(el: HTMLElement): CardKey | null
  /** Every key with at least one element. */
  keys(): ReadonlyArray<CardKey>
  /** Forget everything. */
  clear(): void
}

export function createIdentity(): Identity {
  // A Map, not a WeakMap, so `clear()` can actually forget: a navigation must
  // not let a reused element answer "same card" out of a session that no
  // longer exists (the trap `_elToVid` set in #1427's review). Bounded by the
  // cards on the page; entries leave with `release()` and on every clear.
  const elToKey = new Map<HTMLElement, CardKey>()
  const keyToEls = new Map<CardKey, Map<HTMLElement, CustodyRole>>()

  function attach(key: CardKey, el: HTMLElement, role: CustodyRole): void {
    let els = keyToEls.get(key)
    if (els === undefined) {
      els = new Map()
      keyToEls.set(key, els)
    }
    els.set(el, role)
    elToKey.set(el, key)
  }

  function detach(el: HTMLElement): { key: CardKey; gone: boolean } | null {
    const key = elToKey.get(el)
    if (key === undefined) return null
    elToKey.delete(el)
    const els = keyToEls.get(key)
    els?.delete(el)
    const gone = els === undefined || els.size === 0
    if (gone) keyToEls.delete(key)
    return { key, gone }
  }

  return {
    reconcile(el: HTMLElement, videoId: VideoId): Reconciliation {
      const key = cardKey(videoId)
      const previous = elToKey.get(el)
      if (previous === undefined) {
        attach(key, el, "anchor")
        return { kind: "new", key }
      }
      if (previous === key) {
        // Re-assert custody in case the key's set was dropped without this
        // element hearing of it; a nested stamp is never demoted here.
        if (!keyToEls.get(key)?.has(el)) attach(key, el, "anchor")
        return { kind: "same", key }
      }
      // A different id came out of extraction. Corollary 4.1.1: compare it
      // against what this element was mounted for, on evidence — is the
      // mounted artifact still advertised by this element?
      if (representsVideo(el, keyVideoId(previous))) {
        return { kind: "churn", key: previous }
      }
      const released = detach(el)
      attach(key, el, "anchor")
      return {
        kind: "recycled",
        key,
        previous,
        previousGone: released?.gone ?? true,
      }
    },

    release(el: HTMLElement): { key: CardKey; gone: boolean } | null {
      return detach(el)
    },

    custodyOf(key: CardKey): ReadonlyArray<CustodyTarget> {
      const els = keyToEls.get(key)
      if (els === undefined) return []
      const anchors: Array<CustodyTarget> = []
      const nested: Array<CustodyTarget> = []
      for (const [el, role] of els) {
        ;(role === "anchor" ? anchors : nested).push({ el, role })
      }
      return [...anchors, ...nested]
    },

    addNested(key: CardKey, el: HTMLElement): void {
      const existing = elToKey.get(el)
      if (existing === key) return
      if (existing !== undefined) detach(el)
      attach(key, el, "nested")
    },

    keyOf(el: HTMLElement): CardKey | null {
      return elToKey.get(el) ?? null
    },

    keys(): ReadonlyArray<CardKey> {
      return [...keyToEls.keys()]
    },

    clear(): void {
      keyToEls.clear()
      elToKey.clear()
    },
  }
}

/** Convenience for callers holding a raw id string. */
export function keyFromRaw(raw: string): CardKey {
  return cardKey(asVideoId(raw))
}
