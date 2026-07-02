import type { LegacyStyle } from "@filter/types/popup"

export type LegacyStyleToggleProps = {
  legacyStyle: LegacyStyle
  onChange: (style: LegacyStyle) => void
}

const OPTIONS: Array<{ value: LegacyStyle; label: string }> = [
  { value: "invert", label: "Invert" },
  { value: "dim", label: "Dim" },
]

/**
 * Picks how the "legacy" filter renders: full colour inversion, or a
 * brightness/contrast-only dim meant to pair with the browser's own dark
 * theme (inverting would flip an already-dark background back to light).
 */
export function LegacyStyleToggle({
  legacyStyle,
  onChange,
}: LegacyStyleToggleProps): HTMLElement {
  const el = document.createElement("div")
  el.className = "legacy-style-toggle"

  const label = document.createElement("span")
  label.className = "legacy-style-toggle__label"
  label.textContent = "Legacy style"

  const group = document.createElement("div")
  group.className = "legacy-style-toggle__group"

  OPTIONS.forEach(({ value, label: optionLabel }) => {
    const btn = document.createElement("button")
    const isActive = value === legacyStyle
    btn.className = `legacy-style-toggle__option ${isActive ? "legacy-style-toggle__option--active" : ""}`
    btn.textContent = optionLabel
    btn.setAttribute("aria-pressed", String(isActive))
    btn.onclick = (): void => onChange(value)
    group.appendChild(btn)
  })

  el.append(label, group)
  return el
}
