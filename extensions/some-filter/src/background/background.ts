import type { FilterConfig } from "@censor/types/popup"
import browser from "webextension-polyfill"

browser.runtime.onInstalled.addListener(() => {
  browser.storage.local.set({
    filterEnabled: false,
    filteredTabIds: [],
    filterConfig: {
      invert: 1,
      hueRotate: 180,
      sepia: 0.12,
      brightness: 0.5,
      contrast: 0.92,
    } as FilterConfig,
  })
})

/**
 * Handles the "toggle-filter" command.
 * Uses async/await for clarity and the browser polyfill for cross-browser support.
 */
browser.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-filter") return

  try {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    })

    // Safety check: Ensure we have a valid tab and ID
    if (!activeTab.id) return

    const { filteredTabIds, filterConfig } = await browser.storage.local.get([
      "filteredTabIds",
      "filterConfig",
    ])

    const ids: Array<number> = filteredTabIds ?? []
    const tabId = activeTab.id
    const isFiltered = ids.includes(tabId)

    const newIds = isFiltered
      ? ids.filter((id) => id !== tabId)
      : [...ids, tabId]

    // Update storage and notify the content script
    await browser.storage.local.set({ filteredTabIds: newIds })

    await browser.tabs.sendMessage(tabId, {
      type: "TOGGLE_FILTER",
      enabled: !isFiltered,
      config: filterConfig,
    })
  } catch (error) {
    // Silently catch errors (e.g., messaging a tab where content script isn't loaded)
    // or log them if needed for debugging
  }
})

export {}
