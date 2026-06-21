import {
  faceContainer,
  terminalLabel,
  terminalValue,
} from "@conveyor/components/terminal"

export type StreakCountProps = { complete: number; total: number }

export function StreakCountFace(props: StreakCountProps): HTMLElement {
  const container = faceContainer("sc-face-streak-count", { align: "start" })
  container.append(
    terminalLabel("STREAK"),
    terminalValue(String(props.complete), { bright: true }),
    terminalLabel(`/ ${props.total} categories`)
  )
  return container
}
