import { svgNode } from "@filter/popup/svg"

export type FilterBadgeProps = {
  filteredCount: number
  selectedCount: number
  filterActive: boolean
}

// Postcondition: returns detached HTMLElement ready to mount
export function FilterBadge({
  filteredCount,
  selectedCount,
  filterActive,
}: FilterBadgeProps): HTMLElement {
  const el = document.createElement("header")
  el.className = "filter-badge"
  el.setAttribute("data-active", String(filterActive))

  const iconWrap = document.createElement("div")
  iconWrap.className = "filter-badge__icon"
  iconWrap.appendChild(
    svgNode(
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`
    )
  )

  const title = document.createElement("span")
  title.className = "filter-badge__title"
  title.textContent = "Tab Filter"

  const meta = document.createElement("div")
  meta.className = "filter-badge__meta"

  const countChip = document.createElement("span")
  countChip.className = "filter-badge__count"
  countChip.textContent =
    selectedCount > 0
      ? `${selectedCount} selected`
      : filteredCount > 0
        ? `${filteredCount} filtered`
        : "none active"

  const statusDot = document.createElement("span")
  statusDot.className = `filter-badge__dot filter-badge__dot--${filterActive ? "on" : "off"}`
  statusDot.setAttribute("title", filterActive ? "Filter active" : "Filter off")

  meta.appendChild(countChip)
  meta.appendChild(statusDot)

  const refreshBtn = document.createElement("button")
  refreshBtn.className = "filter-badge__refresh"
  refreshBtn.setAttribute("title", "Refresh tabs")
  refreshBtn.setAttribute("aria-label", "Refresh tabs")
  refreshBtn.appendChild(
    svgNode(
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`
    )
  )
  refreshBtn.addEventListener("click", () => window.location.reload())

  el.appendChild(iconWrap)
  el.appendChild(title)
  el.appendChild(meta)
  el.appendChild(refreshBtn)

  return el
}
