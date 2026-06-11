import {
  faceContainer,
  terminalLabel,
  terminalValue,
} from "@conveyor/components/terminal"

export type StreakCountProps = { complete: number; total: number }

export function StreakCountFace(props: StreakCountProps): HTMLElement {
  const container = faceContainer("sc-face-streak-count")
  container.style.alignItems = "flex-start"
  container.append(
    terminalLabel("STREAK"),
    terminalValue(String(props.complete), true),
    terminalLabel(`/ ${props.total} categories`)
  )
  return container
}
