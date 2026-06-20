import {
  faceContainer,
  terminalEl,
  terminalLabel,
  terminalRow,
} from "@conveyor/components/terminal"

export type TodayProgressProps = {
  tasks: Array<{ label: string; done: boolean }>
}

export function TodayProgressFace(props: TodayProgressProps): HTMLElement {
  const container = faceContainer("sc-face-today", {
    padding: "px-[12px] py-[10px]",
    gap: "gap-[6px]",
  })

  const tasksEl = terminalEl("div", "sc-face-tasks flex flex-col gap-[3px]")

  for (const task of props.tasks) {
    const row = terminalRow()
    const tick = terminalEl(
      "span",
      task.done
        ? "text-[var(--face-text-active)]"
        : "text-[var(--face-text-secondary)]"
    )
    tick.textContent = task.done ? "▪" : "▫"
    const label = terminalEl(
      "span",
      `flex-1 truncate ${
        task.done
          ? "text-[var(--face-text)] line-through"
          : "text-[var(--face-text-secondary)] no-underline"
      }`
    )
    label.textContent = task.label
    row.append(tick, label)
    tasksEl.append(row)
  }

  container.append(terminalLabel("TODAY"), tasksEl)
  return container
}
