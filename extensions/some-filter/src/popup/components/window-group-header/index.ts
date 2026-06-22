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

  // 1. Create the SVG safely using the XML namespace
  const svgNS = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(svgNS, "svg")
  svg.setAttribute("width", "11")
  svg.setAttribute("height", "11")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("fill", "none")
  svg.setAttribute("stroke", "currentColor")
  svg.setAttribute("stroke-width", "2.2")
  svg.setAttribute("stroke-linecap", "round")
  svg.setAttribute("stroke-linejoin", "round")

  const rect = document.createElementNS(svgNS, "rect")
  rect.setAttribute("x", "2")
  rect.setAttribute("y", "3")
  rect.setAttribute("width", "20")
  rect.setAttribute("height", "14")
  rect.setAttribute("rx", "2")

  const line1 = document.createElementNS(svgNS, "line")
  line1.setAttribute("x1", "8")
  line1.setAttribute("y1", "21")
  line1.setAttribute("x2", "16")
  line1.setAttribute("y2", "21")

  const line2 = document.createElementNS(svgNS, "line")
  line2.setAttribute("x1", "12")
  line2.setAttribute("y1", "17")
  line2.setAttribute("x2", "12")
  line2.setAttribute("y2", "21")

  svg.append(rect, line1, line2)

  // 2. Create the text span safely
  const textSpan = document.createElement("span")
  textSpan.textContent = `Window ${windowIndex}`

  // Append SVG and text to the label
  label.append(svg, textSpan)

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

  allBtn.onclick = (e): void => {
    e.stopPropagation()
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
