/**
 * BOYO — background bundle entry point.
 *
 * Responsibilities:
 *   - Initialize ApiClient (reads server URL from browser.storage.local)
 *   - Register the message handler (content ↔ background protocol)
 *   - Clear any stale browser.storage session keys on startup
 *   - Register the "Open diagnostics" tab context-menu item
 *
 * Runtime isolation: no imports from src/content/ or src/popup/ at runtime.
 * Type imports from src/types/ are erased — safe.
 */
import { ApiClient, createMessageHandler } from "@censor/lib/background"
import { ext } from "@censor/platform/background"
import {
  diagnosticsMenuItem,
  isDiagnosticsMenuClick,
} from "@some-extension/common/lib/diagnostics"

async function init(): Promise<void> {
  const api = new ApiClient()
  await api.init()

  ext.runtime.onMessage.addListener(createMessageHandler(api))
}

// eslint-disable-next-line no-console
init().catch((err) => console.error("[BOYO Background] init failed:", err))

// ─────────────────────────────────────────────
// diagnostics
// ─────────────────────────────────────────────

// "bc" namespaces this menu item per Charter idiom #4, matching debug.css's
// own `bc-` prefix. "tab" (right-click the tab strip) is Firefox-only;
// Chrome has no such context and silently fails to create this item, which
// is fine — the popup's own "Diagnostics" footer link covers Chrome.
const DIAGNOSTICS_MENU = diagnosticsMenuItem("bc")

ext.runtime.onInstalled.addListener((): void => {
  void ext.contextMenus.removeAll().then(() => {
    ext.contextMenus.create({
      id: DIAGNOSTICS_MENU.id,
      title: DIAGNOSTICS_MENU.title,
      contexts: ["tab"],
      // Firefox only wraps an extension's items under its manifest icon +
      // name when the extension contributes 2+ top-level items; some-censor
      // has exactly one, so it renders flat unless the item carries its own
      // icon. Per-item `icons` is keyed by size, same as manifest icons.
      icons: { 16: "assets/icon-16.png" },
    })
  })
})

ext.contextMenus.onClicked.addListener((info): void => {
  if (isDiagnosticsMenuClick(info.menuItemId, DIAGNOSTICS_MENU.id)) {
    void ext.tabs.create({ url: ext.runtime.getURL("debug.html") })
  }
})

export {}
