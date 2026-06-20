import {
  faceContainer,
  terminalEl,
  terminalLabel,
  terminalValue,
} from "@conveyor/components/terminal"

export type ActionProps = { label?: string; prompt?: string; hint?: string }

export function ActionFace(props: ActionProps): HTMLElement {
  const container = faceContainer("sc-face-action", {
    align: "start",
    gap: "gap-[8px]",
    extra: "cursor-pointer",
  })

  const prompt = terminalValue(props.prompt ?? "▶ open streak", {
    bright: true,
    cls: "cursor-pointer",
  })
  const hint = terminalEl(
    "span",
    "text-[9px] text-[var(--face-text-secondary)]"
  )
  hint.textContent = props.hint ?? "click to open"

  container.append(terminalLabel(props.label ?? "ACTION"), prompt, hint)
  return container
}
