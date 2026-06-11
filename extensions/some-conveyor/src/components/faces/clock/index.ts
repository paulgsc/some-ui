import {
  faceContainer,
  terminalEl,
  terminalLabel,
  terminalValue,
} from "@conveyor/components/terminal"

export type ClockProps = { time: string; date: string }

export function ClockFace(props: ClockProps): HTMLElement {
  const container = faceContainer("sc-face-clock")
  container.style.alignItems = "flex-start"

  const time = terminalValue(props.time, true)
  Object.assign(time.style, {
    fontSize: "20px",
    fontVariantNumeric: "tabular-nums",
  })
  const date = terminalEl("span")
  date.textContent = props.date
  Object.assign(date.style, {
    color: "var(--face-text-secondary, #2a4a2a)",
    fontSize: "10px",
    fontFamily: "var(--face-font)",
  })

  container.append(terminalLabel("LOCAL TIME"), time, date)
  return container
}
