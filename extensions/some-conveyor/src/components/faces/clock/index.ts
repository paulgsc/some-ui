import { cellNode, ProjectionCell } from "@conveyor/components/projection-cell"

export type ClockProps = { time: string; date: string }

export function ClockFace(props: ClockProps): HTMLElement {
  // Time reads as instrumentation — mono + tabular figures.
  const time = cellNode("span", "font-mono tabular-nums")
  time.textContent = props.time

  return ProjectionCell({
    tag: "LOCAL TIME",
    status: "live",
    body: time,
    emphasizeBody: true,
    meta: props.date,
  })
}
