/**
 * Background service worker (MV3) / background script (MV2).
 *
 * Responsibilities:
 *   - Forward tab visibility changes to content scripts as CONVEYOR_SUSPEND /
 *     CONVEYOR_RESUME messages so the rAF loop and WASM ticks pause when the
 *     tab is hidden.
 *   - Act as the message relay for any future popup↔content communication.
 *
 * WASM note: WasmBridge is intentionally NOT instantiated here yet. The state
 * machine runs in the content script for now. Moving it here (so it runs under
 * the extension CSP rather than the host-page CSP) is tracked in issue #200.
 */

import { ext } from "@conveyor/platform/background"

ext.tabs.onActivated.addListener(({ tabId }): void => {
  void ext.tabs.get(tabId).then((tab): void => {
    if (!tab.active) return
    void ext.tabs
      .sendMessage(tabId, { type: "CONVEYOR_RESUME" })
      .catch((_err: unknown): void => undefined)
  })
})

ext.tabs.onUpdated.addListener((tabId, changeInfo): void => {
  if (changeInfo.status === "loading") {
    void ext.tabs
      .sendMessage(tabId, { type: "CONVEYOR_SUSPEND" })
      .catch((_err: unknown): void => undefined)
  }
})
