import { isExtensionMessage } from "@filter/lib/background/guard"
import { ext } from "@filter/platform/background"
import type { FilterConfig } from "@filter/types/popup"

type TabState = "auto" | "legacy" | "off"

const DEFAULT_FILTER: FilterConfig = {
  invert: 1,
  hueRotate: 180,
  sepia: 0.12,
  brightness: 0.5,
  contrast: 0.92,
}

type StoredState = {
  filteredTabIds: Array<number>
  tabStates: Record<number, TabState>
  filterConfig: FilterConfig
}

function normalizeState(data: Partial<StoredState>): StoredState {
  return {
    filteredTabIds: Array.isArray(data.filteredTabIds)
      ? data.filteredTabIds
      : [],
    tabStates: data.tabStates ?? {},
    filterConfig: data.filterConfig ?? DEFAULT_FILTER,
  }
}

async function getState(): Promise<StoredState> {
  const data = await ext.storage.local.get([
    "filteredTabIds",
    "tabStates",
    "filterConfig",
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

async function sendToTab(
  tabId: number,
  msg: Record<string, unknown>
): Promise<void> {
  try {
    await ext.tabs.sendMessage(tabId, msg)
  } catch {
    // intentionally ignored
  }
}

// ─────────────────────────────────────────────
// install
// ─────────────────────────────────────────────

ext.runtime.onInstalled.addListener((): void => {
  void ext.storage.local.set({
    filteredTabIds: [],
    tabStates: {},
    filterConfig: DEFAULT_FILTER,
  })
})

// ─────────────────────────────────────────────
// message handling
// ─────────────────────────────────────────────

ext.runtime.onMessage.addListener((msg, sender): boolean | Promise<unknown> => {
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
        tabState: tabStates[tabId] ?? "auto",
      }
    }

    void handler()
    return true
  }

  if (msg.type === "SET_FILTERED_TABS" && Array.isArray(msg.ids)) {
    const handler = async (): Promise<void> => {
      const { filteredTabIds, filterConfig, tabStates } = await getState()

      const desired = new Set(msg.ids)
      const current = new Set(filteredTabIds)

      const nextTabStates: Record<number, TabState> = {
        ...tabStates,
      }

      const allTabs = new Set([...Array.from(desired), ...Array.from(current)])

      for (const tabId of allTabs) {
        nextTabStates[tabId] = desired.has(tabId) ? "legacy" : "auto"
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
})

// ─────────────────────────────────────────────
// keyboard shortcut
// ─────────────────────────────────────────────

const STATE_CYCLE: Record<TabState, TabState> = {
  auto: "legacy",
  legacy: "off",
  off: "auto",
}

ext.commands.onCommand.addListener((command): void => {
  if (command !== "toggle-filter") return

  void (async (): Promise<void> => {
    const [activeTab] = await ext.tabs.query({
      active: true,
      currentWindow: true,
    })

    if (!activeTab || typeof activeTab.id !== "number") return

    const { tabStates } = await getState()
    const current = tabStates[activeTab.id] ?? "auto"
    const next = STATE_CYCLE[current]

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
