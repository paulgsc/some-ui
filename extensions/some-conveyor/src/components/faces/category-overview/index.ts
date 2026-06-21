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
  const container = faceContainer("sc-face-categories", {
    padding: "px-[12px] py-[10px]",
    extra: "overflow-y-hidden",
  })

  const grid = terminalEl(
    "div",
    "sc-face-cat-grid flex flex-col gap-[3px] mt-[4px]"
  )

  for (const cat of props.categories) {
    const row = terminalRow()
    const icon = terminalEl("span", "text-[13px] leading-none")
    icon.textContent = cat.icon
    const name = terminalEl("span", "flex-1 truncate")
    name.textContent = cat.name
    const pct = terminalEl(
      "span",
      `min-w-[30px] text-right ${
        cat.pct === 100
          ? "text-[var(--face-text-active)]"
          : "text-[var(--face-text)]"
      }`
    )
    pct.textContent = `${cat.pct}%`
    row.append(icon, name, pct)
    grid.append(row)
  }

  container.append(terminalLabel("CATEGORIES"), grid)
  return container
}
