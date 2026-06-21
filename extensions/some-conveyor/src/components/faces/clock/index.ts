import {
  faceContainer,
  terminalEl,
  terminalLabel,
  terminalValue,
} from "@conveyor/components/terminal"

export type ClockProps = { time: string; date: string }

export function ClockFace(props: ClockProps): HTMLElement {
  const container = faceContainer("sc-face-clock", { align: "start" })

  const time = terminalValue(props.time, {
    bright: true,
    size: "text-[20px]",
    cls: "tabular-nums",
  })
  const date = terminalEl(
    "span",
    "text-[10px] text-[var(--face-text-secondary)]"
  )
  date.textContent = props.date

  container.append(terminalLabel("LOCAL TIME"), time, date)
  return container
}
