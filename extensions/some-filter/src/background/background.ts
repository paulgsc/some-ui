import { isExtensionMessage } from "@filter/lib/background/guard"
import {
  DEFAULT_LEGACY_STYLE,
  isLegacyStyle,
  LEGACY_PRESETS,
} from "@filter/lib/legacy-presets"
import { DEFAULT_TAB_STATE, nextTabState } from "@filter/lib/tab-state"
import { ext } from "@filter/platform/background"
import type { ExtensionMessage } from "@filter/types/message"
import type { FilterConfig, LegacyStyle } from "@filter/types/popup"
import type { TabState } from "@filter/types/tab"

const DEFAULT_FILTER: FilterConfig = LEGACY_PRESETS[DEFAULT_LEGACY_STYLE]

type StoredState = {
  filteredTabIds: Array<number>
  tabStates: Record<number, TabState>
  filterConfig: FilterConfig
  legacyStyle: LegacyStyle
}

function normalizeState(data: Partial<StoredState>): StoredState {
  return {
    filteredTabIds: Array.isArray(data.filteredTabIds)
      ? data.filteredTabIds
      : [],
    tabStates: data.tabStates ?? {},
    filterConfig: data.filterConfig ?? DEFAULT_FILTER,
    legacyStyle: isLegacyStyle(data.legacyStyle)
      ? data.legacyStyle
      : DEFAULT_LEGACY_STYLE,
  }
}

async function getState(): Promise<StoredState> {
  const data = await ext.storage.local.get([
    "filteredTabIds",
    "tabStates",
    "filterConfig",
    "legacyStyle",
  ])

  return normalizeState(data)
}

async function setTabState(tabId: number, state: TabState): Promise<void> {
  const stored = await getState()

  const tabStates: Record<number, TabState> = {
    ...stored.tabStates,
    [tabId]: state,
  }

  const filteredTabIds =
    state === "legacy"
      ? Array.from(new Set([...stored.filteredTabIds, tabId]))
      : stored.filteredTabIds.filter((id) => id !== tabId)

  await ext.storage.local.set({
    tabStates,
    filteredTabIds,
  })
}

async function sendToTab(tabId: number, msg: ExtensionMessage): Promise<void> {
  try {
    await ext.tabs.sendMessage(tabId, msg)
  } catch {
    // intentionally ignored
  }
}

// ─────────────────────────────────────────────
// legacy style (invert vs dim)
// ─────────────────────────────────────────────

const LEGACY_STYLE_MENU_PARENT_ID = "sw-legacy-style"
const LEGACY_STYLE_MENU_IDS: Record<LegacyStyle, string> = {
  invert: "sw-legacy-style-invert",
  dim: "sw-legacy-style-dim",
}
const MENU_ID_TO_LEGACY_STYLE: Record<string, LegacyStyle> = {
  [LEGACY_STYLE_MENU_IDS.invert]: "invert",
  [LEGACY_STYLE_MENU_IDS.dim]: "dim",
}

function syncLegacyStyleMenu(style: LegacyStyle): void {
  for (const [candidate, id] of Object.entries(LEGACY_STYLE_MENU_IDS)) {
    void ext.contextMenus
      .update(id, { checked: candidate === style })
      .catch(() => {
        // Menu may not exist yet (e.g. Chrome, which has no "tab" context and
        // may have failed to create these items) — nothing to reconcile.
      })
  }
}

/** Persist the chosen legacy style, push the new config to every tab
 * currently in "legacy" mode, and reflect the choice in the context menu. */
async function applyLegacyStyle(style: LegacyStyle): Promise<void> {
  const filterConfig = LEGACY_PRESETS[style]

  await ext.storage.local.set({ legacyStyle: style, filterConfig })
  syncLegacyStyleMenu(style)

  const { filteredTabIds } = await getState()
  await Promise.all(
    filteredTabIds.map((tabId) =>
      sendToTab(tabId, {
        type: "TOGGLE_FILTER",
        enabled: true,
        config: filterConfig,
      })
    )
  )
}

// ─────────────────────────────────────────────
// install
// ─────────────────────────────────────────────

ext.runtime.onInstalled.addListener((): void => {
  void ext.storage.local.set({
    filteredTabIds: [],
    tabStates: {},
    filterConfig: DEFAULT_FILTER,
    legacyStyle: DEFAULT_LEGACY_STYLE,
  })

  // "tab" (right-click the tab strip) is Firefox-only; Chrome has no such
  // context and silently fails to create these items, which is fine — the
  // popup toggle covers Chrome.
  void ext.contextMenus.removeAll().then(() => {
    ext.contextMenus.create({
      id: LEGACY_STYLE_MENU_PARENT_ID,
      title: "Legacy filter style",
      contexts: ["tab"],
    })
    ext.contextMenus.create({
      id: LEGACY_STYLE_MENU_IDS.invert,
      parentId: LEGACY_STYLE_MENU_PARENT_ID,
      title: "Invert colors",
      type: "radio",
      checked: DEFAULT_LEGACY_STYLE === "invert",
      contexts: ["tab"],
    })
    ext.contextMenus.create({
      id: LEGACY_STYLE_MENU_IDS.dim,
      parentId: LEGACY_STYLE_MENU_PARENT_ID,
      title: "Dim (pairs with browser dark theme)",
      type: "radio",
      checked: DEFAULT_LEGACY_STYLE === "dim",
      contexts: ["tab"],
    })
  })
})

ext.contextMenus.onClicked.addListener((info): void => {
  const style = MENU_ID_TO_LEGACY_STYLE[String(info.menuItemId)]

  if (style) {
    void applyLegacyStyle(style)
  }
})

// ─────────────────────────────────────────────
// message handling
// ─────────────────────────────────────────────

// This module's listener types come from `browser`-shaped definitions
// (platform/api.ts), which model Firefox's promise-returning onMessage —
// they don't declare a `sendResponse` third parameter at all, because
// Firefox doesn't need one. At runtime, on the Chromium build, `ext` is
// literally `globalThis.chrome`, and `chrome.runtime.onMessage` still uses
// the classic callback contract: returning a bare `true` promises an
// eventual `sendResponse(...)` call, and nothing else counts. Returning
// the handler's own Promise directly (`return handler()`, relying on
// Chrome's documented "a returned Promise is treated like sendResponse"
// support) was tried and measured to *not* take effect in this build —
// the sender received `undefined` immediately rather than the resolved
// value. `sendResponse` is captured explicitly below so `GET_TAB_FILTER_STATE`
// actually reaches its caller.
type SendResponse = (response: unknown) => void

ext.runtime.onMessage.addListener(
  (msg, sender, sendResponse: SendResponse): boolean | Promise<unknown> => {
    if (!isExtensionMessage(msg)) {
      return false
    }

    if (msg.type === "GET_TAB_FILTER_STATE") {
      const handler = async (): Promise<unknown> => {
        const tabId = sender.tab?.id
        if (!tabId) {
          return { enabled: false, config: DEFAULT_FILTER }
        }

        const { filteredTabIds, filterConfig, tabStates } = await getState()

        return {
          enabled: filteredTabIds.includes(tabId),
          config: filterConfig,
          tabState: tabStates[tabId] ?? DEFAULT_TAB_STATE,
        }
      }

      void handler().then(sendResponse)
      return true
    }

    if (msg.type === "SET_LEGACY_STYLE") {
      void applyLegacyStyle(msg.style)
      return false
    }

    if (msg.type === "SET_FILTERED_TABS" && Array.isArray(msg.ids)) {
      const handler = async (): Promise<void> => {
        const { filteredTabIds, filterConfig, tabStates } = await getState()

        const desired = new Set(msg.ids)
        const current = new Set(filteredTabIds)

        const nextTabStates: Record<number, TabState> = {
          ...tabStates,
        }

        const allTabs = new Set([
          ...Array.from(desired),
          ...Array.from(current),
        ])

        for (const tabId of allTabs) {
          nextTabStates[tabId] = desired.has(tabId)
            ? "legacy"
            : DEFAULT_TAB_STATE
        }

        await ext.storage.local.set({
          filteredTabIds: msg.ids,
          tabStates: nextTabStates,
        })

        const tabs = await ext.tabs.query({})

        const tasks: Array<Promise<unknown>> = []

        for (const t of tabs) {
          if (typeof t.id !== "number") continue

          const wasFiltered = current.has(t.id)
          const willFilter = desired.has(t.id)

          if (wasFiltered === willFilter) continue

          tasks.push(
            sendToTab(t.id, {
              type: "TOGGLE_FILTER",
              enabled: willFilter,
              config: filterConfig,
            })
          )
        }

        await Promise.all(tasks)
      }

      void handler()
      return true
    }

    return false
  }
)

// ─────────────────────────────────────────────
// keyboard shortcut
// ─────────────────────────────────────────────

ext.commands.onCommand.addListener((command): void => {
  if (command !== "toggle-filter") return

  void (async (): Promise<void> => {
    const [activeTab] = await ext.tabs.query({
      active: true,
      currentWindow: true,
    })

    if (!activeTab || typeof activeTab.id !== "number") return

    const { tabStates } = await getState()
    const current = tabStates[activeTab.id] ?? DEFAULT_TAB_STATE
    const next = nextTabState(current)

    await setTabState(activeTab.id, next)
    await sendToTab(activeTab.id, {
      type: "CYCLE_TAB_STATE",
    })
  })()
})

// ─────────────────────────────────────────────
// tab lifecycle
// ─────────────────────────────────────────────

ext.tabs.onUpdated.addListener((tabId, changeInfo): void => {
  if (changeInfo.status !== "complete") return

  void (async (): Promise<void> => {
    const { tabStates, filterConfig } = await getState()

    if (tabStates[tabId] === "legacy") {
      await sendToTab(tabId, {
        type: "TOGGLE_FILTER",
        enabled: true,
        config: filterConfig,
      })
    }
  })()
})

ext.tabs.onRemoved.addListener((tabId): void => {
  void (async (): Promise<void> => {
    const { filteredTabIds, tabStates } = await getState()

    const { [tabId]: _, ...remaining } = tabStates

    await ext.storage.local.set({
      filteredTabIds: filteredTabIds.filter((id) => id !== tabId),
      tabStates: remaining,
    })
  })()
})

export {}
