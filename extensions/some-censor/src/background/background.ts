/**
 * BOYO — background bundle entry point.
 *
 * Its one job is the tab and toolbar-button menu (#1966): the switch, the
 * mode, what autoplay does at a held video, the settings page and
 * Diagnostics. The menu is created once, at install, and its marks are set
 * from what is stored each time it opens, so they always match the popup
 * and the settings page. Nothing here listens to storage. Firefox wakes
 * the background for every context menu it opens, anywhere, so the marks
 * are set only when the menu shown holds these items.
 *
 * Runtime isolation: no imports from src/content/ or src/popup/ at runtime.
 */
import { menuCommand, menuItems } from "@censor/lib/settings/menu"
import {
  createSaver,
  parseSettings,
  SETTINGS_KEY,
} from "@censor/lib/settings/settings"
import { MENU_WORDS } from "@censor/lib/settings/words"
import { ext } from "@censor/platform/background"
import { assertNever } from "@some-extension/common"
import { diagnosticsMenuItem } from "@some-extension/common/lib/diagnostics"

// "tab" (right-click the tab strip) is Firefox-only; Chrome has no such
// context and fails to create these items, which leaves the popup and the
// settings page there. "action" is the toolbar button's own menu. Firefox
// gathers the tab menu's items under the extension's name.
const CONTEXTS: Array<browser.menus.ContextType> = ["tab", "action"]

const DIAGNOSTICS_MENU = diagnosticsMenuItem("bc", MENU_WORDS.diagnostics)

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
    // Ignored: the menus are a shortcut. On Chrome the "tab" context does not
    // exist (above), and the popup and settings page carry every command.
    .catch(() => undefined)
})

// Firefox only: Chrome has neither `onShown` nor `refresh`, nor these menus.
const firefoxMenus: {
  readonly onShown?: typeof ext.contextMenus.onShown
  readonly refresh?: typeof ext.contextMenus.refresh
} = ext.contextMenus

firefoxMenus.onShown?.addListener((info): void => {
  if (info.menuIds.length === 0) return
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
    // Ignored: a menu that could not refresh shows its last state until it
    // is opened again.
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
