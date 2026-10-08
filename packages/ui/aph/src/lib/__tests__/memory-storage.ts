import type { AphStorage } from "@aph/lib/stored"

/** A `localStorage` stand-in; set `full` and every write throws, as on quota. */
export function memoryStorage(
  kept = new Map<string, string>()
): AphStorage & { kept: Map<string, string>; full: boolean } {
  const storage = {
    kept,
    full: false,
    getItem: (key: string): string | null => kept.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      if (storage.full) throw new DOMException("full", "QuotaExceededError")
      kept.set(key, value)
    },
  }
  return storage
}
