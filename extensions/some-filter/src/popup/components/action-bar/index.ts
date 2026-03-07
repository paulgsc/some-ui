
export type ActionBarProps = {
  selectedCount: number
  statusFilter: string | null
  onSelectAll: () => void
  onDeselect: () => void
  onApply: () => void
  onStatusFilterChange: (filter: string | null) => void
}

const STATUS_FILTERS = [
  { label: "Active", value: "active", icon: `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>` },
  { label: "Audible", value: "audible", icon: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>` },
  { label: "Pinned", value: "pinned", icon: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/></svg>` },
]

export function ActionBar({
  selectedCount,
  statusFilter,
  onSelectAll,
  onDeselect,
  onApply,
  onStatusFilterChange,
}: ActionBarProps): HTMLElement {
  const el = document.createElement("div")
  el.className = "action-bar"

  // ── Filter Pills ─────────────────────────────────────────────────────────
  const pillsRow = document.createElement("div")
  pillsRow.className = "action-bar__pills"

  const createPill = (label: string, value: string | null, icon?: string) => {
    const btn = document.createElement("button")
    const isActive = statusFilter === value
    btn.className = `action-bar__pill ${isActive ? "action-bar__pill--active" : ""}`
    btn.innerHTML = icon ? `${icon}<span>${label}</span>` : label
    btn.onclick = () => onStatusFilterChange(isActive ? null : value)
    return btn
  }

  pillsRow.append(createPill("All", null))
  STATUS_FILTERS.forEach(f => pillsRow.append(createPill(f.label, f.value, f.icon)))

  // ── Selection Controls ──────────────────────────────────────────────────
  const ctrlRow = document.createElement("div")
  ctrlRow.className = "action-bar__controls"

  const selectAllBtn = document.createElement("button")
  selectAllBtn.className = "action-bar__ctrl"
  selectAllBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg><span>Select All</span>`
  selectAllBtn.onclick = onSelectAll

  const deselectBtn = document.createElement("button")
  deselectBtn.className = "action-bar__ctrl"
  deselectBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg><span>Deselect</span>`
  deselectBtn.onclick = onDeselect

  const applyBtn = document.createElement("button")
  const hasSelection = selectedCount > 0
  applyBtn.className = `action-bar__apply ${hasSelection ? "action-bar__apply--active" : ""}`
  applyBtn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
    <span>Apply Filter${hasSelection ? ` (${selectedCount})` : ""}</span>`
  applyBtn.onclick = onApply

  ctrlRow.append(selectAllBtn, deselectBtn, applyBtn)
  el.append(pillsRow, ctrlRow)

  return el
}
