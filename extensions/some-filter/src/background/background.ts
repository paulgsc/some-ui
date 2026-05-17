/**
 *
 * Tab state model (per-tab):
 *   "auto"   → dark theme CSS (default)
 *   "legacy" → aggressive invert filter on <html>
 *   "off"    → no filtering
 *
 * Keyboard shortcut (Ctrl+Shift+F / Cmd+Shift+F) cycles: auto → legacy → off → auto
 *
 * Storage schema:
 *   filteredTabIds: number[]        legacy compat — tabs with legacy filter enabled
 *   tabStates: Record<number, TabState>   per-tab state (new)
 *   filterConfig: FilterConfig
 */

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
  filteredTabIds: number[]
  tabStates: Record<number, TabState>
  filterConfig: FilterConfig
}

async function getState(): Promise<StoredState> {
  const data = await browser.storage.local.get([
    "filteredTabIds",
    "tabStates",
    "filterConfig",
  ])
  return {
    filteredTabIds: (data.filteredTabIds as number[]) ?? [],
    tabStates: (data.tabStates as Record<number, TabState>) ?? {},
    filterConfig: (data.filterConfig as FilterConfig) ?? DEFAULT_FILTER,
  }
}

async function setTabState(tabId: number, state: TabState): Promise<void> {
  const stored = await getState()
  const tabStates = { ...stored.tabStates, [tabId]: state }

  // Keep filteredTabIds in sync for popup compat (legacy = filtered)
  const filteredTabIds =
    state === "legacy"
      ? [...new Set([...stored.filteredTabIds, tabId])]
      : stored.filteredTabIds.filter((id) => id !== tabId)

  await browser.storage.local.set({ tabStates, filteredTabIds })
}

async function sendToTab(
  tabId: number,
  msg: Record<string, unknown>
): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, msg)
  } catch {}
}

// ── Install ───────────────────────────────────────────────────────────────────

browser.runtime.onInstalled.addListener(() => {
  browser.storage.local.set({
    filteredTabIds: [],
    tabStates: {},
    filterConfig: DEFAULT_FILTER,
  })
})

// ── Messages ──────────────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener((msg, sender) => {
  const m = msg as { type: string; ids?: number[] }

  // Content script asking for its current state on load
  if (m.type === "GET_TAB_FILTER_STATE") {
    return (async () => {
      const tabId = sender.tab?.id
      if (!tabId) return { enabled: false, config: DEFAULT_FILTER }
      const { filteredTabIds, filterConfig, tabStates } = await getState()
      const tabState = tabStates[tabId]
      return {
        enabled: filteredTabIds.includes(tabId),
        config: filterConfig,
        tabState: tabState ?? "auto",
      }
    })()
  }

  // Popup apply button — set specific tabs to legacy filter
  if (m.type === "SET_FILTERED_TABS" && Array.isArray(m.ids)) {
    return (async () => {
      const { filteredTabIds, filterConfig, tabStates } = await getState()
      const desired = new Set(m.ids)
      const current = new Set(filteredTabIds)

      // Update tabStates for affected tabs
      const newTabStates = { ...tabStates }
      for (const tabId of [...desired, ...current]) {
        newTabStates[tabId] = desired.has(tabId) ? "legacy" : "auto"
      }

      await browser.storage.local.set({
        filteredTabIds: m.ids,
        tabStates: newTabStates,
      })

      const tabs = await browser.tabs.query({})
      await Promise.allSettled(
        tabs
          .filter((t): t is typeof t & { id: number } => t.id !== undefined)
          .map((t) => {
            const wasFiltered = current.has(t.id)
            const willFilter = desired.has(t.id)
            if (wasFiltered === willFilter) return Promise.resolve()
            return sendToTab(t.id, {
              type: "TOGGLE_FILTER",
              enabled: willFilter,
              config: filterConfig,
            })
          })
      )
    })()
  }
})

// ── Keyboard shortcut: cycle state ───────────────────────────────────────────

const STATE_CYCLE: Record<TabState, TabState> = {
  auto: "legacy",
  legacy: "off",
  off: "auto",
}

browser.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-filter") return

  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  })
  if (!activeTab?.id) return

  const tabId = activeTab.id
  const { tabStates } = await getState()
  const current = tabStates[tabId] ?? "auto"
  const next = STATE_CYCLE[current]

  await setTabState(tabId, next)
  await sendToTab(tabId, { type: "CYCLE_TAB_STATE" })
})

// ── Reapply on tab load ───────────────────────────────────────────────────────

browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return
  const { tabStates, filterConfig } = await getState()
  const state = tabStates[tabId]

  // Only need to push legacy state — auto and off are handled by content.ts init
  if (state === "legacy") {
    await sendToTab(tabId, {
      type: "TOGGLE_FILTER",
      enabled: true,
      config: filterConfig,
    })
  }
})

// ── Cleanup on tab close ──────────────────────────────────────────────────────

browser.tabs.onRemoved.addListener(async (tabId) => {
  const { filteredTabIds, tabStates } = await getState()
  const { [tabId]: _, ...remainingStates } = tabStates
  await browser.storage.local.set({
    filteredTabIds: filteredTabIds.filter((id) => id !== tabId),
    tabStates: remainingStates,
  })
})

export {}
