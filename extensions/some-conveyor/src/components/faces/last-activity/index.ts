import { ProjectionCell } from "@conveyor/components/projection-cell"

export type LastActivityProps = {
  lastActiveText: string
  focusIcon: string
  focusName: string
}

export function LastActivityFace(props: LastActivityProps): HTMLElement {
  const focus =
    props.focusName === "--"
      ? "--"
      : `${props.focusIcon} ${props.focusName}`.trim()

  return ProjectionCell({
    tag: "FOCUS",
    status: "idle",
    body: focus,
    meta: `active ${props.lastActiveText}`,
  })
}
