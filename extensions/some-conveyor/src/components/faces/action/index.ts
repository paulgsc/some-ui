import { ProjectionCell } from "@conveyor/components/projection-cell"

export type ActionProps = { label?: string; prompt?: string; hint?: string }

export function ActionFace(props: ActionProps): HTMLElement {
  return ProjectionCell({
    tag: props.label ?? "ACTION",
    status: "idle",
    body: props.prompt ?? "▶ open streak",
    meta: props.hint ?? "click to open",
    interactive: true,
  })
}
