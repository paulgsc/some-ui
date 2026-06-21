/**
 * ControlRail — the instrumentation HUD docked above the belt.
 *
 * Pure view: `(props) => HTMLElement`. No scheduler/WASM wiring — chip values
 * are prop-driven (a typed seam for a later logic-layer issue). Colour/type from
 * the shared `--cv-*` tokens + brand fonts (shadow `:host` / Storybook frame).
 * The pulse dot uses the `sc-rail-pulse` animation from styles/conveyor.css.
 */

import { el, elText } from "@conveyor/components/dom"

export type ChipTone = "default" | "signal" | "live" | "alert"

export type RailChip = {
  label: string
  value?: string
  tone?: ChipTone
  /** Render a leading status dot in the chip's tone. */
  dot?: boolean
}

export type ControlRailProps = {
  /** Identity label. Defaults to "some-conveyor". */
  id?: string
  /** Animate the live pulse dot. Defaults to true. */
  pulse?: boolean
  chips: ReadonlyArray<RailChip>
}

const VALUE_TONE: Record<ChipTone, string> = {
  default: "text-[var(--cv-ink)]",
  signal: "text-[var(--cv-signal)]",
  live: "text-[var(--cv-live)]",
  alert: "text-[var(--cv-alert)]",
}

const DOT_TONE: Record<ChipTone, string> = {
  default: "bg-[var(--cv-ink-3)]",
  signal: "bg-[var(--cv-signal)]",
  live: "bg-[var(--cv-live)]",
  alert: "bg-[var(--cv-alert)]",
}

function chipEl(chip: RailChip): HTMLElement {
  const tone = chip.tone ?? "default"
  const node = el(
    "span",
    "inline-flex items-center gap-[7px] whitespace-nowrap rounded-[6px] border border-[var(--cv-line)] bg-[var(--cv-steel-700)] px-[9px] py-[5px] font-mono text-[11px] font-medium text-[var(--cv-ink-2)]"
  )
  if (chip.dot) {
    node.append(
      el("span", `inline-block size-[6px] rounded-full ${DOT_TONE[tone]}`)
    )
  }
  node.append(elText("span", chip.label))
  if (chip.value !== undefined) {
    node.append(elText("span", chip.value, `font-semibold ${VALUE_TONE[tone]}`))
  }
  return node
}

export function ControlRail(props: ControlRailProps): HTMLElement {
  const rail = el(
    "div",
    "flex flex-wrap items-center gap-[14px] rounded-t-[12px] border border-b-0 border-[var(--cv-line)] bg-[var(--cv-steel-800)] px-[16px] py-[11px]"
  )

  const id = el(
    "span",
    "flex items-center gap-[9px] font-display text-[14px] font-bold tracking-[-0.01em] text-[var(--cv-ink)]"
  )
  const pulse = el(
    "span",
    "inline-block size-[8px] shrink-0 rounded-full bg-[var(--cv-live)]"
  )
  if (props.pulse ?? true) pulse.classList.add("sc-rail-pulse")
  id.append(pulse, elText("span", props.id ?? "some-conveyor"))
  rail.append(id)

  const chips = el("div", "flex flex-wrap items-center gap-[8px]")
  for (const chip of props.chips) chips.append(chipEl(chip))
  rail.append(chips)

  return rail
}
