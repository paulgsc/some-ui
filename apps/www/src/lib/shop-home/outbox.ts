/**
 * The shop's hunches home didn't answer (KPLAY's KP4, #3596): each kept on
 * this phone, in `localStorage`, until home answers its look-up, which the
 * Practice lane's drain sends again (`lib/home-link/hunches`). Home keeps a
 * miss once per hunch however often it is sent, so a hunch is let go only
 * once home has answered it, hit or kept. One home refused (its words out
 * of home's bounds) is set aside: kept here, and not sent again. Nothing
 * here sends. Phone-only.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import {
  localStorageOrNull,
  onJson,
  openKept,
  salvageList,
  writeKept,
} from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"

/** A hunch whose look-up home didn't answer, whole, to go home. */
export type PendingHunch = {
  /** The hunch's name to home: the shop's id and its number. */
  readonly hunch: string
  /** The owner's words. */
  readonly words: string
  /** When it was kept, as ISO 8601. */
  readonly at: string
  /** Home refused it: kept, and not sent again. */
  readonly refused?: true
}

function isPending(value: unknown): value is PendingHunch {
  if (typeof value !== "object" || value === null) return false
  const refused: unknown = Reflect.get(value, "refused")
  return (
    (refused === undefined || refused === true) &&
    ["hunch", "words", "at"].every(
      (key) => typeof Reflect.get(value, key) === "string"
    )
  )
}

export type HunchOutbox = {
  /**
   * Keeps a hunch, once however often it is kept; false when it can't, or
   * when home refused it before.
   */
  keep: (words: string, hunch: string) => boolean
  /** Every hunch kept, oldest first, set aside or not. */
  kept: () => Array<PendingHunch>
  /** The hunches to send home: those not set aside. */
  going: () => Array<PendingHunch>
  /**
   * What home said of these hunches (the drain alone): those it answered
   * go, those it refused are set aside.
   */
  answered: (
    answered: ReadonlySet<string>,
    refused: ReadonlySet<string>
  ) => void
  subscribe: (listener: () => void) => () => void
}

const KEY = "some-ui:shop-hunches"
const items = onJson(salvageList(isPending))

export function createHunchOutbox(ports: {
  storage: () => KeyedStorage | null
  now: () => Date
}): HunchOutbox {
  const listeners = new Set<() => void>()
  const read = (): Array<PendingHunch> =>
    openKept(ports.storage(), KEY, items, []).value
  const write = (next: Array<PendingHunch>): boolean => {
    if (writeKept(ports.storage(), KEY, next, items)) {
      for (const listener of listeners) listener()
      return true
    }
    reportFailure({
      port: "shop hunches",
      error: {
        ...toIntentError(null),
        summary: "This phone couldn't keep a hunch home didn't answer.",
      },
    })
    return false
  }
  return {
    keep(words, hunch): boolean {
      const kept = read()
      const held = kept.find((pending) => pending.hunch === hunch)
      // One set aside is never sent again: not kept for home.
      if (held !== undefined) return held.refused !== true
      return write([...kept, { hunch, words, at: ports.now().toISOString() }])
    },
    kept: read,
    going: () => read().filter((pending) => pending.refused !== true),
    answered(answered, refused): void {
      if (answered.size + refused.size === 0) return
      write(
        read()
          .filter((pending) => !answered.has(pending.hunch))
          .map((pending) =>
            refused.has(pending.hunch)
              ? { ...pending, refused: true as const }
              : pending
          )
      )
    },
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
  }
}

/** The phone's hunches, over `localStorage` (the viewer's in-memory copy, too). */
export const hunchOutbox: HunchOutbox = createHunchOutbox({
  storage: localStorageOrNull,
  now: () => new Date(),
})
