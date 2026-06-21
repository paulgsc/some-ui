import { ProjectionCell } from "@conveyor/components/projection-cell"

export type StreakCountProps = { complete: number; total: number }

export function StreakCountFace(props: StreakCountProps): HTMLElement {
  return ProjectionCell({
    tag: "STREAK",
    status: props.complete > 0 ? "live" : "idle",
    body: String(props.complete),
    emphasizeBody: true,
    meta: `/ ${props.total} categories`,
  })
}
