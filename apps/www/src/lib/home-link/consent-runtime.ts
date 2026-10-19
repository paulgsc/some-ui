/**
 * The consent log (`./consent-model`) kept on this phone, in one
 * `localStorage` key: read once per page load, and each choice appended and
 * written whole. A log this phone cannot read is never written over: every
 * choice is then refused, and nothing is kept on home until it can be read.
 */
import { localStorageOrNull } from "@some-ui/core-utils"

import type { Choice, ConsentLog } from "./consent-model"
import { appended, parseLog } from "./consent-model"

export const CONSENT_KEY = "some-ui.home.consent.v1"

export type Consent = {
  getSnapshot: () => ConsentLog
  subscribe: (listener: () => void) => () => void
  /** Adds `choice` to the log; false when this phone would not keep it. */
  choose: (choice: Choice) => boolean
}

export function createConsent(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  now: () => number
): Consent {
  let log: ConsentLog = []
  let readable = storage !== null
  try {
    const text = storage?.getItem(CONSENT_KEY) ?? null
    const read = text === null ? [] : parseLog(text)
    if (read === null) readable = false
    else log = read
  } catch {
    readable = false
  }
  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => log,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    choose(choice): boolean {
      if (!readable || storage === null) return false
      const next = appended(log, choice, now())
      if (next === log) return true
      try {
        storage.setItem(CONSENT_KEY, JSON.stringify(next))
      } catch {
        return false
      }
      log = next
      for (const listener of listeners) listener()
      return true
    },
  }
}

let consent: Consent | null = null

/** One log per page load, read from this phone's storage. */
export function phoneConsent(): Consent {
  consent ??= createConsent(localStorageOrNull(), Date.now)
  return consent
}
