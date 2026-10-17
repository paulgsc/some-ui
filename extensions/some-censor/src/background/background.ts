/**
 * BOYO — background bundle entry point.
 *
 * Its one job is the "Open diagnostics" tab context-menu item. Settings live
 * in `storage.local`, written by the popup and read by the content script
 * directly (`lib/settings`), so nothing here relays messages.
 *
 * Runtime isolation: no imports from src/content/ or src/popup/ at runtime.
 */
import { ext } from "@censor/platform/background"
import {
  diagnosticsMenuItem,
  isDiagnosticsMenuClick,
} from "@some-extension/common/lib/diagnostics"

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
