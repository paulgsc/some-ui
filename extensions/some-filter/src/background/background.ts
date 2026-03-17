
import type { FilterConfig } from "@censor/types/popup"

const DEFAULT_FILTER: FilterConfig = {
  invert: 1,
  hueRotate: 180,
  sepia: 0.12,
  brightness: 0.5,
  contrast: 0.92,
}

type ExtensionState = {
  filteredTabIds: number[]
  filterConfig: FilterConfig
}

async function getState(): Promise<ExtensionState> {
  const data = await browser.storage.local.get(["filteredTabIds", "filterConfig"])
  return {
    filteredTabIds: (data.filteredTabIds as number[]) ?? [],
    filterConfig: (data.filterConfig as FilterConfig) ?? DEFAULT_FILTER,
  }
}

// Sends TOGGLE_FILTER to a tab, safely
async function applyFilterToTab(tabId: number, enabled: boolean, config: FilterConfig) {
  try {
    await browser.tabs.sendMessage(tabId, { type: "TOGGLE_FILTER", enabled, config })
  } catch {}
}

// Initialize storage
browser.runtime.onInstalled.addListener(() => {
  browser.storage.local.set({ filteredTabIds: [], filterConfig: DEFAULT_FILTER })
})

// Popup & content script messages
browser.runtime.onMessage.addListener((msg, sender) => {
  const m = msg as { type: string; ids?: number[] }

  if (m.type === "GET_TAB_FILTER_STATE") {
    return (async () => {
      const tabId = sender.tab?.id
      if (!tabId) return { enabled: false, config: DEFAULT_FILTER }
      const { filteredTabIds, filterConfig } = await getState()
      return { enabled: filteredTabIds.includes(tabId), config: filterConfig }
    })()
  }

  if (m.type === "SET_FILTERED_TABS" && Array.isArray(m.ids)) {
    return (async () => {
      const { filteredTabIds, filterConfig } = await getState()
      const desired = new Set(m.ids)
      const current = new Set(filteredTabIds)

      await browser.storage.local.set({ filteredTabIds: m.ids })

      const tabs = await browser.tabs.query({})
      await Promise.allSettled(
        tabs
          .filter((t): t is typeof t & { id: number } => t.id !== undefined)
          .map((t) => {
            const wasFiltered = current.has(t.id)
            const willFilter = desired.has(t.id)
            if (wasFiltered === willFilter) return Promise.resolve()
            return applyFilterToTab(t.id, willFilter, filterConfig)
          })
      )
    })()
  }
})

// Toggle shortcut
browser.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-filter") return

  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!activeTab.id) return

  const { filteredTabIds, filterConfig } = await getState()
  const tabId = activeTab.id
  const isFiltered = filteredTabIds.includes(tabId)
  const newIds = isFiltered ? filteredTabIds.filter((id) => id !== tabId) : [...filteredTabIds, tabId]

  await browser.storage.local.set({ filteredTabIds: newIds })
  await applyFilterToTab(tabId, !isFiltered, filterConfig)
})

// Reapply filters on tab load/refresh
browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return
  const { filteredTabIds, filterConfig } = await getState()
  if (filteredTabIds.includes(tabId)) {
    await applyFilterToTab(tabId, true, filterConfig)
  }
})

// Remove closed tabs from storage
browser.tabs.onRemoved.addListener(async (tabId) => {
  const { filteredTabIds } = await getState()
  if (!filteredTabIds.includes(tabId)) return
  await browser.storage.local.set({ filteredTabIds: filteredTabIds.filter((id) => id !== tabId) })
})

export {}
