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
  const container = faceContainer("sc-face-today")
  container.style.padding = "10px 12px"
  container.style.gap = "6px"

  const tasksEl = terminalEl("div", "sc-face-tasks")
  Object.assign(tasksEl.style, {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
  })

  for (const task of props.tasks) {
    const row = terminalRow()
    const tick = terminalEl("span")
    tick.textContent = task.done ? "▪" : "▫"
    tick.style.color = task.done
      ? "var(--face-text-active, #00ff41)"
      : "var(--face-text-secondary, #2a4a2a)"
    const label = terminalEl("span")
    label.textContent = task.label
    label.style.color = task.done
      ? "var(--face-text, #4a7c4a)"
      : "var(--face-text-secondary, #2a4a2a)"
    label.style.textDecoration = task.done ? "line-through" : "none"
    Object.assign(label.style, {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      flex: "1",
    })
    row.append(tick, label)
    tasksEl.append(row)
  }

  container.append(terminalLabel("TODAY"), tasksEl)
  return container
}
