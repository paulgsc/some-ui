import { cellNode, ProjectionCell } from "@conveyor/components/projection-cell"

export type TodayProgressProps = {
  tasks: Array<{ label: string; done: boolean }>
}

export function TodayProgressFace(props: TodayProgressProps): HTMLElement {
  const list = cellNode("div", "flex flex-col gap-[3px]")

  for (const task of props.tasks) {
    const row = cellNode(
      "div",
      "flex items-center gap-[6px] font-sans text-[12px] font-normal"
    )
    const tick = cellNode(
      "span",
      task.done ? "text-[var(--cv-live)]" : "text-[var(--cv-ink-3)]"
    )
    tick.textContent = task.done ? "▪" : "▫"
    const label = cellNode(
      "span",
      `flex-1 truncate ${
        task.done
          ? "text-[var(--cv-ink-2)] line-through"
          : "text-[var(--cv-ink-3)] no-underline"
      }`
    )
    label.textContent = task.label
    row.append(tick, label)
    list.append(row)
  }

  const done = props.tasks.filter((t) => t.done).length
  const total = props.tasks.length

  return ProjectionCell({
    tag: "TODAY",
    status: total > 0 && done === total ? "live" : "idle",
    body: list,
    meta:
      total > 0
        ? [
            {
              text: `${done}/${total}`,
              tone: done === total ? "pos" : "default",
            },
          ]
        : undefined,
  })
}
