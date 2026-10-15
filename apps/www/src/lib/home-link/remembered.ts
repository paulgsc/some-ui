/**
 * What the Home server block keeps on this phone between visits: the typed
 * address and the last sync's line. Empty, or not kept, when storage refuses.
 */
import { localStorageOrNull } from "@some-ui/core-utils"

export function remembered(key: string): string {
  return localStorageOrNull()?.getItem(key) ?? ""
}

export function remember(key: string, value: string): void {
  try {
    localStorageOrNull()?.setItem(key, value)
  } catch {
    // Full: not kept, and nothing depends on it.
  }
}
