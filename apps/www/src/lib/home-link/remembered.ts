/**
 * What the phone keeps of its home between visits (Settings › Home's block,
 * and the welcome, which starts from its address): the typed
 * address and the last sync's and shelf send's lines. Empty, or not kept,
 * when storage refuses.
 */
import { localStorageOrNull } from "@some-ui/core-utils"

/** The home address typed last in Settings › Home, where the welcome starts too. */
export const HOME_ADDRESS_KEY = "some-ui.device.home-server.v1"

export function remembered(key: string): string {
  return localStorageOrNull()?.getItem(key) ?? ""
}

export function remember(key: string, value: string): void {
  try {
    localStorageOrNull()?.setItem(key, value)
  } catch {
    // Ignored: storage full: not kept, and nothing depends on it.
  }
}
