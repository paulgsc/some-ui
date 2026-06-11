import {
  faceContainer,
  terminalEl,
  terminalLabel,
  terminalValue,
} from "@conveyor/components/terminal"

export type ActionProps = { label?: string; prompt?: string; hint?: string }

export function ActionFace(props: ActionProps): HTMLElement {
  const container = faceContainer("sc-face-action")
  Object.assign(container.style, {
    alignItems: "flex-start",
    gap: "8px",
    cursor: "pointer",
  })

  const prompt = terminalValue(props.prompt ?? "▶ open streak", true)
  prompt.style.cursor = "pointer"
  const hint = terminalEl("span")
  hint.textContent = props.hint ?? "click to open"
  Object.assign(hint.style, {
    color: "var(--face-text-secondary, #2a4a2a)",
    fontSize: "9px",
    fontFamily: "var(--face-font)",
  })

  container.append(terminalLabel(props.label ?? "ACTION"), prompt, hint)
  return container
}
