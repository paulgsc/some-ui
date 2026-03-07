import { ActionBar } from "@censor/popup/components/action-bar"
import { FilterBadge } from "@censor/popup/components/filter-badge"
import { TabList } from "@censor/popup/components/tablist"
import { WindowGroupHeader } from "@censor/popup/components/window-group-header"
import type {
  FilterConfig,
  PopupState,
  TabEntry,
  WindowGroup,
} from "@censor/types/popup"
import browser from "webextension-polyfill"

// ── API logic ───────────────────────────────────────────────────────────────

/**
 * Fetches all tabs using the polyfilled browser API.
 * The polyfill ensures browser.tabs.query returns a Promise.
 */
async function fetchTabs(): Promise<Array<TabEntry>> {
  const tabs = await browser.tabs.query({})
  return tabs
    .filter(
      (t): t is typeof t & { id: number; url: string; title: string } =>
        t.id !== undefined && t.url !== undefined && t.title !== undefined
    )
    .map((t) => ({
      id: t.id,
      windowId: t.windowId,
      title: t.title,
      url: t.url,
      favIconUrl: t.favIconUrl ?? "",
      active: t.active,
      audible: t.audible ?? false,
      pinned: t.pinned,
      status: t.status ?? "complete",
    }))
}

function groupByWindow(entries: Array<TabEntry>): Array<WindowGroup> {
  const map = new Map<number, Array<TabEntry>>()
  for (const entry of entries) {
    const group = map.get(entry.windowId) ?? []
    group.push(entry)
    map.set(entry.windowId, group)
  }
  const groups: Array<WindowGroup> = []
  let windowIndex = 1
  for (const [windowId, tabs] of map) {
    groups.push({ windowId, windowIndex: windowIndex++, tabs })
  }
  return groups
}

async function getStorageState(): Promise<{
  filterEnabled: boolean
  filterConfig: FilterConfig
  filteredTabIds: Array<number>
}> {
  // browser.storage.local.get also returns a Promise via the polyfill
  const data = await browser.storage.local.get([
    "filterEnabled",
    "filterConfig",
    "filteredTabIds",
  ])

  return {
    filterEnabled: Boolean(data.filterEnabled),
    filterConfig: (data.filterConfig as FilterConfig) ?? {
      invert: 1,
      hueRotate: 180,
      sepia: 0.12,
      brightness: 0.5,
      contrast: 0.92,
    },
    filteredTabIds: (data.filteredTabIds as Array<number>) ?? [],
  }
}

async function applyFilterToTabs(tabIds: Array<number>): Promise<void> {
  const { filterConfig } = await getStorageState()
  await browser.storage.local.set({ filteredTabIds: tabIds })

  const allTabs = await browser.tabs.query({})

  // We use Promise.allSettled to send messages concurrently without
  // blocking if one tab (like a restricted system page) fails.
  await Promise.allSettled(
    allTabs.map((tab) => {
      if (!tab.id) return Promise.resolve()
      const enabled = tabIds.includes(tab.id)
      return browser.tabs.sendMessage(tab.id, {
        type: "TOGGLE_FILTER",
        enabled,
        config: filterConfig,
      })
    })
  )
}

// ── State ─────────────────────────────────────────────────────────────────────

let state: PopupState = {
  selectedTabIds: new Set(),
  filterActive: false,
  groups: [],
  statusFilter: null,
  filteredTabIds: new Set(),
  filterConfig: {
    invert: 1,
    hueRotate: 180,
    sepia: 0.12,
    brightness: 0.5,
    contrast: 0.92,
  },
}

function setState(patch: Partial<PopupState>): void {
  state = { ...state, ...patch }
  render()
}

// ── Event handlers ────────────────────────────────────────────────────────────

function onTabToggle(tabId: number): void {
  const next = new Set(state.selectedTabIds)
  if (next.has(tabId)) {
    next.delete(tabId)
  } else {
    next.add(tabId)
  }
  setState({ selectedTabIds: next })
}

function onSelectAll(): void {
  const allIds = state.groups.flatMap((g) =>
    g.tabs
      .filter(
        (t) => !state.statusFilter || matchesFilter(t, state.statusFilter)
      )
      .map((t) => t.id)
  )
  setState({ selectedTabIds: new Set(allIds) })
}

function onDeselect(): void {
  setState({ selectedTabIds: new Set() })
}

function onApply(): void {
  const ids = Array.from(state.selectedTabIds)
  applyFilterToTabs(ids)
  setState({ filteredTabIds: new Set(ids) })
}

function onStatusFilterChange(filter: string | null): void {
  setState({ statusFilter: filter })
}

function onWindowSelectAll(windowId: number): void {
  const windowTabs =
    state.groups
      .find((g) => g.windowId === windowId)
      ?.tabs.filter(
        (t) => !state.statusFilter || matchesFilter(t, state.statusFilter)
      )
      .map((t) => t.id) ?? []
  const next = new Set(state.selectedTabIds)
  windowTabs.forEach((id) => next.add(id))
  setState({ selectedTabIds: next })
}

function onWindowDeselect(windowId: number): void {
  const windowTabIds = new Set(
    state.groups.find((g) => g.windowId === windowId)?.tabs.map((t) => t.id) ??
      []
  )
  const next = new Set(
    [...state.selectedTabIds].filter((id) => !windowTabIds.has(id))
  )
  setState({ selectedTabIds: next })
}

function matchesFilter(tab: TabEntry, filter: string): boolean {
  if (filter === "active") return tab.active
  if (filter === "audible") return tab.audible
  if (filter === "pinned") return tab.pinned
  return true
}

// ── Render ────────────────────────────────────────────────────────────────────

function render(): void {
  const root = document.getElementById("app")
  if (!root) return
  root.innerHTML = ""

  const visibleGroups = state.groups.map((group) => ({
    ...group,
    tabs: state.statusFilter
      ? group.tabs.filter((t) => matchesFilter(t, state.statusFilter))
      : group.tabs,
  }))

  const badge = FilterBadge({
    filteredCount: state.filteredTabIds.size,
    selectedCount: state.selectedTabIds.size,
    filterActive: state.filterActive,
  })

  const actionBar = ActionBar({
    selectedCount: state.selectedTabIds.size,
    statusFilter: state.statusFilter,
    onSelectAll,
    onDeselect,
    onApply,
    onStatusFilterChange,
  })

  const tabList = TabList({
    groups: visibleGroups,
    selectedTabIds: state.selectedTabIds,
    filteredTabIds: state.filteredTabIds,
    onTabToggle,
    onWindowSelectAll,
    onWindowDeselect,
    WindowGroupHeader,
  })

  root.appendChild(badge)
  root.appendChild(actionBar)
  root.appendChild(tabList)
}

// ── Init ──────────────────────────────────────────────────────────────────────

;(async () => {
  try {
    const [tabs, storage] = await Promise.all([fetchTabs(), getStorageState()])
    const groups = groupByWindow(tabs)

    setState({
      groups,
      filterActive: storage.filterEnabled,
      filteredTabIds: new Set(storage.filteredTabIds),
      filterConfig: storage.filterConfig,
      selectedTabIds: new Set(storage.filteredTabIds),
    })
  } catch (err) {
    console.error("Failed to initialize popup:", err)
  }
})()
