import {
  faceContainer,
  terminalLabel,
  terminalValue,
} from "@conveyor/components/terminal"

export type LastActivityProps = {
  lastActiveText: string
  focusIcon: string
  focusName: string
}

export function LastActivityFace(props: LastActivityProps): HTMLElement {
  const container = faceContainer("sc-face-last-activity")
  container.style.alignItems = "stretch"
  container.style.gap = "6px"

  const time = terminalValue(props.lastActiveText, false)
  time.style.fontSize = "14px"
  const focus = terminalValue(
    props.focusName === "--"
      ? "--"
      : `${props.focusIcon} ${props.focusName}`.trim(),
    false
  )

  container.append(
    terminalLabel("LAST ACTIVE"),
    time,
    terminalLabel("CURRENT FOCUS"),
    focus
  )
  return container
}
