import type { KeyedStorage } from "@some-ui/core-utils"

/**
 * The tenant stores' storage: the page's `localStorage`, whose refusals
 * (a full quota, a blocked one) reach the caller; nothing where there is no
 * window. Tests pass an in-memory one instead.
 */
export const browserLocalStorage: KeyedStorage = {
  getItem: (key) =>
    typeof window === "undefined" ? null : window.localStorage.getItem(key),
  setItem: (key, value) => {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value)
  },
  removeItem: (key) => {
    if (typeof window !== "undefined") window.localStorage.removeItem(key)
  },
}

/** Default simulated network latency for the mock tenant repositories. */
export const MOCK_LATENCY_MS = 150

export function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** A write the device would not keep (full, or blocked storage). */
export class NotKeptError extends Error {
  constructor() {
    super("This device did not keep the change")
    this.name = "NotKeptError"
  }
}

/**
 * `<prefix>-`, then a UUID, or the time and a random part where
 * `crypto.randomUUID` is missing: either way the id ends in random characters.
 *
 * RB1 (`packages/ui/topik/ROUTINE.md`): the reflections routine names a session
 * by its id's last 8 characters; `__tests__/session-id.test.ts`, "RB1", holds
 * that they are this random part.
 */
export function generateId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
