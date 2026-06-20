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
  const container = faceContainer("sc-face-last-activity", {
    align: "stretch",
    gap: "gap-[6px]",
  })

  const time = terminalValue(props.lastActiveText, { size: "text-[14px]" })
  const focus = terminalValue(
    props.focusName === "--"
      ? "--"
      : `${props.focusIcon} ${props.focusName}`.trim()
  )

  container.append(
    terminalLabel("LAST ACTIVE"),
    time,
    terminalLabel("CURRENT FOCUS"),
    focus
  )
  return container
}
