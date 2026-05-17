export type WindowGroupHeaderProps = {
  windowIndex: number
  windowId: number
  tabCount: number
  selectedCount: number
  onSelectAll: () => void
  onDeselect: () => void
}

export function WindowGroupHeader({
  windowIndex,
  tabCount,
  selectedCount,
  onSelectAll,
  onDeselect,
}: WindowGroupHeaderProps): HTMLElement {
  const el = document.createElement("div")
  el.className = "window-header"

  const label = document.createElement("div")
  label.className = "window-header__label"

  // Icon and Text
  label.innerHTML = `
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
    <span>Window ${windowIndex}</span>`

  const countBadge = document.createElement("span")
  countBadge.className = "window-header__count"
  countBadge.textContent = String(tabCount)
  label.append(countBadge)

  const actions = document.createElement("div")
  actions.className = "window-header__actions"

  const isAllSelected = selectedCount === tabCount

  const allBtn = document.createElement("button")
  allBtn.className = "window-header__btn"
  allBtn.textContent = isAllSelected ? "−" : "+"
  allBtn.title = isAllSelected ? "Deselect window" : "Select window"

  allBtn.onclick = (e) => {
    e.stopPropagation() // Prevent triggering any parent row clicks
    if (isAllSelected) {
      onDeselect()
    } else {
      onSelectAll()
    }
  }

  actions.append(allBtn)
  el.append(label, actions)

  return el
}
