import type { WindowGroupHeaderProps } from "@filter/popup/components/window-group-header"
import type { TabEntry, WindowGroup } from "@filter/types/popup"

export type TabListProps = {
  groups: Array<WindowGroup>
  selectedTabIds: Set<number>
  filteredTabIds: Set<number>
  onTabToggle: (tabId: number) => void
  onWindowSelectAll: (windowId: number) => void
  onWindowDeselect: (windowId: number) => void
  WindowGroupHeader: (props: WindowGroupHeaderProps) => HTMLElement
}

const getFaviconSvg = () => `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>`

function buildTabRow(
  tab: TabEntry,
  selected: boolean,
  filtered: boolean,
  onToggle: () => void
): HTMLElement {
  const row = document.createElement("div")
  row.className = "tab-row"
  if (selected) row.classList.add("tab-row--selected")
  if (filtered) row.classList.add("tab-row--filtered")
  if (tab.active) row.classList.add("tab-row--active")

  // Checkbox
  const checkbox = document.createElement("div")
  checkbox.className = `tab-row__checkbox ${selected ? "tab-row__checkbox--checked" : ""}`
  if (selected) {
    checkbox.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
  }

  // Favicon logic
  const favicon = document.createElement("div")
  favicon.className = "tab-row__favicon"
  if (tab.favIconUrl) {
    const img = document.createElement("img")
    img.src = tab.favIconUrl
    img.width = 14
    img.height = 14
    img.onerror = () => {
      favicon.innerHTML = getFaviconSvg()
    }
    favicon.append(img)
  } else {
    favicon.innerHTML = getFaviconSvg()
  }

  // Content
  const content = document.createElement("div")
  content.className = "tab-row__content"

  const title = document.createElement("span")
  title.className = "tab-row__title"
  title.textContent = tab.title
  title.title = tab.title

  const urlEl = document.createElement("span")
  urlEl.className = "tab-row__url"
  try {
    urlEl.textContent = new URL(tab.url).hostname
  } catch {
    urlEl.textContent = tab.url
  }
  content.append(title, urlEl)

  // Badges
  const badges = document.createElement("div")
  badges.className = "tab-row__badges"

  const addBadge = (className: string, title: string, icon: string) => {
    const b = document.createElement("span")
    b.className = `badge ${className}`
    b.title = title
    b.innerHTML = icon
    badges.append(b)
  }

  if (tab.active)
    addBadge(
      "badge--active",
      "Active tab",
      `<svg width="6" height="6" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="12"/></svg>`
    )
  if (tab.audible)
    addBadge(
      "badge--audible",
      "Playing audio",
      `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`
    )
  if (tab.pinned)
    addBadge(
      "badge--pinned",
      "Pinned",
      `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/></svg>`
    )
  if (filtered)
    addBadge(
      "badge--filtered",
      "Filtered",
      `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`
    )

  row.append(checkbox, favicon, content, badges)
  row.onclick = onToggle

  return row
}

export function TabList(props: TabListProps): HTMLElement {
  const {
    groups,
    selectedTabIds,
    filteredTabIds,
    onTabToggle,
    onWindowSelectAll,
    onWindowDeselect,
    WindowGroupHeader,
  } = props
  const el = document.createElement("div")
  el.className = "tab-list"

  if (!groups || groups.every((g) => g.tabs.length === 0)) {
    const empty = document.createElement("div")
    empty.className = "tab-list__empty"
    empty.textContent = "No tabs match the current filter."
    el.append(empty)
    return el
  }

  for (const group of groups) {
    if (group.tabs.length === 0) continue

    const section = document.createElement("div")
    section.className = "tab-list__window"

    const selectedInWindow = group.tabs.filter((t) =>
      selectedTabIds.has(t.id)
    ).length

    const header = WindowGroupHeader({
      windowIndex: group.windowIndex,
      windowId: group.windowId,
      tabCount: group.tabs.length,
      selectedCount: selectedInWindow,
      onSelectAll: () => onWindowSelectAll(group.windowId),
      onDeselect: () => onWindowDeselect(group.windowId),
    })

    section.append(header)

    for (const tab of group.tabs) {
      const row = buildTabRow(
        tab,
        selectedTabIds.has(tab.id),
        filteredTabIds.has(tab.id),
        () => onTabToggle(tab.id)
      )
      section.append(row)
    }

    el.append(section)
  }

  return el
}
