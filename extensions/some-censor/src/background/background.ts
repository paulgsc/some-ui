/**
 * BOYO — background bundle entry point.
 *
 * Its one job is the tab and toolbar-button menu (#1966): the switch, the
 * mode, what autoplay does at a held video, the settings page and
 * Diagnostics. The menu is created once, at install, and its marks are set
 * from what is stored each time it opens, so they always match the popup
 * and the settings page. Nothing here listens to storage, so the
 * background sleeps until the menu is opened or clicked.
 *
 * Runtime isolation: no imports from src/content/ or src/popup/ at runtime.
 */
import { menuCommand, menuItems } from "@censor/lib/settings/menu"
import {
  createSaver,
  parseSettings,
  SETTINGS_KEY,
} from "@censor/lib/settings/settings"
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

async function stored(): Promise<ReturnType<typeof parseSettings>> {
  const record = await ext.storage.local.get(SETTINGS_KEY)
  return parseSettings(record[SETTINGS_KEY])
}

ext.runtime.onInstalled.addListener((): void => {
  void ext.contextMenus
    .removeAll()
    .then(stored)
    .then((settings) => {
      for (const item of menuItems(settings, DIAGNOSTICS_MENU)) {
        ext.contextMenus.create({ ...item, contexts: CONTEXTS })
      }
    })
    .catch(() => undefined)
})

// Firefox only: Chrome has neither `onShown` nor `refresh`, nor these menus.
const firefoxMenus: {
  readonly onShown?: typeof ext.contextMenus.onShown
  readonly refresh?: typeof ext.contextMenus.refresh
} = ext.contextMenus

firefoxMenus.onShown?.addListener((): void => {
  void stored()
    .then(async (settings) => {
      for (const { id, checked, enabled } of menuItems(
        settings,
        DIAGNOSTICS_MENU
      )) {
        if (checked === undefined && enabled === undefined) continue
        await ext.contextMenus.update(id, {
          ...(checked === undefined ? {} : { checked }),
          ...(enabled === undefined ? {} : { enabled }),
        })
      }
      await firefoxMenus.refresh?.()
    })
    .catch(() => undefined)
})

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
