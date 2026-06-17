import { ActionBar } from "@filter/popup/components/action-bar"
import { FilterBadge } from "@filter/popup/components/filter-badge"
import { TabList } from "@filter/popup/components/tablist"
import { WindowGroupHeader } from "@filter/popup/components/window-group-header"
import type {
  FilterConfig,
  PopupState,
  TabEntry,
  WindowGroup,
} from "@filter/types/popup"

import "./popup.css"

const DEFAULT_FILTER_CONFIG: FilterConfig = {
  invert: 1,
  hueRotate: 180,
  sepia: 0.12,
  brightness: 0.5,
  contrast: 0.92,
}

// ── API logic ───────────────────────────────────────────────────────────────

async function fetchTabs(): Promise<Array<TabEntry>> {
  const tabs = await browser.tabs.query({})
  return tabs
    .filter(
      (
        t
      ): t is typeof t & {
        id: number
        windowId: number
        url: string
        title: string
      } =>
        t.id !== undefined &&
        t.windowId !== undefined &&
        t.url !== undefined &&
        t.title !== undefined
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
  let windowIndex = 1
  return Array.from(map.entries()).map(([windowId, tabs]) => ({
    windowId,
    windowIndex: windowIndex++,
    tabs,
  }))
}

// Runtime type guard helper to verify storage objects safely without 'as' assertions
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

async function getStorageState(): Promise<{
  filteredTabIds: Array<number>
  filterConfig: FilterConfig
}> {
  const data: unknown = await browser.storage.local.get([
    "filteredTabIds",
    "filterConfig",
  ])

  if (!isRecord(data)) {
    return { filteredTabIds: [], filterConfig: DEFAULT_FILTER_CONFIG }
  }

  const rawTabIds = data.filteredTabIds
  const filteredTabIds = Array.isArray(rawTabIds)
    ? rawTabIds.filter((id): id is number => typeof id === "number")
    : []

  const rawConfig = data.filterConfig
  let filterConfig = DEFAULT_FILTER_CONFIG

  if (isRecord(rawConfig)) {
    filterConfig = {
      invert:
        typeof rawConfig.invert === "number"
          ? rawConfig.invert
          : DEFAULT_FILTER_CONFIG.invert,
      hueRotate:
        typeof rawConfig.hueRotate === "number"
          ? rawConfig.hueRotate
          : DEFAULT_FILTER_CONFIG.hueRotate,
      sepia:
        typeof rawConfig.sepia === "number"
          ? rawConfig.sepia
          : DEFAULT_FILTER_CONFIG.sepia,
      brightness:
        typeof rawConfig.brightness === "number"
          ? rawConfig.brightness
          : DEFAULT_FILTER_CONFIG.brightness,
      contrast:
        typeof rawConfig.contrast === "number"
          ? rawConfig.contrast
          : DEFAULT_FILTER_CONFIG.contrast,
    }
  }

  return { filteredTabIds, filterConfig }
}

// ── State ─────────────────────────────────────────────────────────────────────

let state: PopupState = {
  selectedTabIds: new Set(),
  filterActive: false,
  groups: [],
  statusFilter: null,
  filteredTabIds: new Set(),
  filterConfig: DEFAULT_FILTER_CONFIG,
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

async function onApply(): Promise<void> {
  const ids = Array.from(state.selectedTabIds)
  await browser.runtime.sendMessage({ type: "SET_FILTERED_TABS", ids })
  setState({
    filteredTabIds: new Set(ids),
    filterActive: ids.length > 0,
  })
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

  const visibleGroups = state.groups.map((g) => ({
    ...g,
    tabs: state.statusFilter
      ? g.tabs.filter((t) => matchesFilter(t, state.statusFilter ?? ""))
      : g.tabs,
  }))

  root.appendChild(
    FilterBadge({
      filteredCount: state.filteredTabIds.size,
      selectedCount: state.selectedTabIds.size,
      filterActive: state.filterActive,
    })
  )

  root.appendChild(
    ActionBar({
      selectedCount: state.selectedTabIds.size,
      statusFilter: state.statusFilter,
      onSelectAll,
      onDeselect,
      onApply: () => {
        void onApply()
      },
      onStatusFilterChange,
    })
  )

  root.appendChild(
    TabList({
      groups: visibleGroups,
      selectedTabIds: state.selectedTabIds,
      filteredTabIds: state.filteredTabIds,
      onTabToggle,
      onWindowSelectAll,
      onWindowDeselect,
      WindowGroupHeader,
    })
  )
}

// ── Init ──────────────────────────────────────────────────────────────────────

void (async () => {
  try {
    const [tabs, storage] = await Promise.all([fetchTabs(), getStorageState()])
    const groups = groupByWindow(tabs)

    setState({
      groups,
      filteredTabIds: new Set(storage.filteredTabIds),
      filterConfig: storage.filterConfig,
      filterActive: storage.filteredTabIds.length > 0,
      selectedTabIds: new Set(storage.filteredTabIds),
    })
  } catch {
    // Gracefully handle UI initialization failure silently per lint rules
  }
})()
