/**
 * The shop's hunches home didn't answer (KPLAY's KP4, #3596): each kept on
 * this phone, in `localStorage`, until home answers its look-up, which the
 * Practice lane's drain sends again (`lib/home-link/hunches`). Home keeps a
 * miss once per hunch however often it is sent, so a hunch is let go only
 * once home has answered it, hit or kept. Nothing here sends. Phone-only.
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
}

function isPending(value: unknown): value is PendingHunch {
  if (typeof value !== "object" || value === null) return false
  return ["hunch", "words", "at"].every(
    (key) => typeof Reflect.get(value, key) === "string"
  )
}

export type HunchOutbox = {
  /** Keeps a hunch, once however often it is kept. */
  keep: (words: string, hunch: string) => void
  /** Every hunch kept, oldest first. */
  kept: () => Array<PendingHunch>
  /** Home answered these hunches (the drain alone): they go. */
  answered: (hunches: ReadonlySet<string>) => void
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
  const write = (next: Array<PendingHunch>): void => {
    if (writeKept(ports.storage(), KEY, next, items)) {
      for (const listener of listeners) listener()
      return
    }
    reportFailure({
      port: "shop hunches",
      error: {
        ...toIntentError(null),
        summary: "This phone couldn't keep a hunch home didn't answer.",
      },
    })
  }
  return {
    keep(words, hunch): void {
      const kept = read()
      if (kept.some((pending) => pending.hunch === hunch)) return
      write([...kept, { hunch, words, at: ports.now().toISOString() }])
    },
    kept: read,
    answered(hunches): void {
      if (hunches.size === 0) return
      write(read().filter((pending) => !hunches.has(pending.hunch)))
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
