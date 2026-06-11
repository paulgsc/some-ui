import {
  faceContainer,
  terminalEl,
  terminalLabel,
  terminalRow,
} from "@conveyor/components/terminal"

export type CategoryOverviewProps = {
  categories: Array<{ icon: string; name: string; pct: number }>
}

export function CategoryOverviewFace(
  props: CategoryOverviewProps
): HTMLElement {
  const container = faceContainer("sc-face-categories")
  container.style.padding = "10px 12px"
  container.style.overflowY = "hidden"

  const grid = terminalEl("div", "sc-face-cat-grid")
  Object.assign(grid.style, {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    marginTop: "4px",
  })

  for (const cat of props.categories) {
    const row = terminalRow()
    const icon = terminalEl("span")
    icon.textContent = cat.icon
    Object.assign(icon.style, { fontSize: "13px", lineHeight: "1" })
    const name = terminalEl("span")
    name.textContent = cat.name
    Object.assign(name.style, {
      flex: "1",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    })
    const pct = terminalEl("span")
    pct.textContent = `${cat.pct}%`
    pct.style.color =
      cat.pct === 100
        ? "var(--face-text-active, #00ff41)"
        : "var(--face-text, #4a7c4a)"
    Object.assign(pct.style, { minWidth: "30px", textAlign: "right" })
    row.append(icon, name, pct)
    grid.append(row)
  }

  container.append(terminalLabel("CATEGORIES"), grid)
  return container
}
