import { cellNode, ProjectionCell } from "@conveyor/components/projection-cell"

export type CategoryOverviewProps = {
  categories: Array<{ icon: string; name: string; pct: number }>
}

export function CategoryOverviewFace(
  props: CategoryOverviewProps
): HTMLElement {
  const grid = cellNode("div", "flex flex-col gap-[3px]")

  for (const cat of props.categories) {
    const row = cellNode(
      "div",
      "flex items-center gap-[6px] font-sans text-[12px] font-normal"
    )
    const icon = cellNode("span", "text-[13px] leading-none")
    icon.textContent = cat.icon
    const name = cellNode("span", "flex-1 truncate text-[var(--cv-ink-2)]")
    name.textContent = cat.name
    const pct = cellNode(
      "span",
      `min-w-[30px] text-right font-mono ${
        cat.pct === 100 ? "text-[var(--cv-live)]" : "text-[var(--cv-ink-3)]"
      }`
    )
    pct.textContent = `${cat.pct}%`
    row.append(icon, name, pct)
    grid.append(row)
  }

  return ProjectionCell({ tag: "CATEGORIES", status: "idle", body: grid })
}
