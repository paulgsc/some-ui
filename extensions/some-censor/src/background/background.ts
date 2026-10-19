/**
 * BOYO — background bundle entry point.
 *
 * Its one job is the tab and toolbar-button menu (#1966): the switch, the
 * mode, what autoplay does at a held video, the settings page and
 * Diagnostics. The menu is rebuilt from what is stored on every change, so
 * its marks always match the popup and the settings page.
 *
 * Runtime isolation: no imports from src/content/ or src/popup/ at runtime.
 */
import { menuCommand, menuItems } from "@censor/lib/settings/menu"
import type { Settings } from "@censor/lib/settings/settings"
import { createSaver, followSettings } from "@censor/lib/settings/settings"
import { ext } from "@censor/platform/background"
import { assertNever } from "@some-extension/common"
import { diagnosticsMenuItem } from "@some-extension/common/lib/diagnostics"

// "tab" (right-click the tab strip) is Firefox-only; Chrome has no such
// context and fails to create these items, which leaves the popup and the
// settings page there. "action" is the toolbar button's own menu. Firefox
// gathers the tab menu's items under the extension's name.
const CONTEXTS: Array<browser.menus.ContextType> = ["tab", "action"]

const DIAGNOSTICS_MENU = diagnosticsMenuItem("bc")

const save = createSaver(ext.storage.local)

let building: Promise<void> = Promise.resolve()

/** Rebuild the menu for `settings`, one rebuild at a time. */
function build(settings: Settings): void {
  building = building
    .then(async () => {
      await ext.contextMenus.removeAll()
      for (const item of menuItems(settings, DIAGNOSTICS_MENU)) {
        ext.contextMenus.create({ ...item, contexts: CONTEXTS })
      }
    })
    .catch(() => undefined)
}

followSettings(ext.storage, build)

ext.contextMenus.onClicked.addListener((info): void => {
  const command = menuCommand(
    String(info.menuItemId),
    info.checked,
    DIAGNOSTICS_MENU.id
  )
  if (command === null) return
  switch (command.kind) {
    case "change": {
      save(command.change)
      break
    }
    case "settings": {
      void ext.runtime.openOptionsPage()
      break
    }
    case "diagnostics": {
      void ext.tabs.create({ url: ext.runtime.getURL("debug.html") })
      break
    }
    default: {
      assertNever(command)
    }
  }
})

export {}
