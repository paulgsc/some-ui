/**
 * terminal — pure presentational primitives for the "instrumentation panel"
 * aesthetic. No I/O, no app state, no browser.* — DOM composed from
 * @some-ui/styles preset utilities (compiled to static CSS by @unocss/cli).
 *
 * Font family, color and line-height inherit from the enclosing `.sc-face`
 * (themeable ThemeEngine custom props), so these primitives only declare what
 * actually differs from that inherited baseline.
 */

export function terminalEl(tag: string, cls = ""): HTMLElement {
  const el = document.createElement(tag)
  el.className = cls ? `w-full ${cls}` : "w-full"
  return el
}

export function terminalLabel(text: string): HTMLElement {
  const el = terminalEl(
    "span",
    "sc-face-label block uppercase select-none text-[9px] tracking-[0.12em] mb-[2px] text-[var(--face-text-secondary)]"
  )
  el.textContent = text
  return el
}

export function terminalValue(
  text: string,
  opts: { bright?: boolean; size?: string; cls?: string } = {}
): HTMLElement {
  const { bright = false, size = bright ? "text-[18px]" : "", cls = "" } = opts
  const el = terminalEl(
    "span",
    [
      "sc-face-value block",
      bright ? "font-bold text-[var(--face-text-active)]" : "",
      size,
      cls,
    ]
      .filter(Boolean)
      .join(" ")
  )
  el.textContent = text
  return el
}

export function terminalRow(): HTMLElement {
  return terminalEl("div", "sc-face-row flex items-center gap-[6px]")
}

/** Vertical stack with the standard face padding. */
export function faceContainer(
  cls: string,
  opts: {
    align?: "center" | "start" | "stretch"
    padding?: string
    gap?: string
    extra?: string
  } = {}
): HTMLElement {
  const {
    align = "stretch",
    padding = "p-[12px]",
    gap = "gap-[4px]",
    extra = "",
  } = opts
  const alignCls =
    align === "center"
      ? "items-center"
      : align === "start"
        ? "items-start"
        : "items-stretch"
  return terminalEl(
    "div",
    [
      cls,
      "flex flex-col justify-center w-full h-full box-border",
      alignCls,
      padding,
      gap,
      extra,
    ]
      .filter(Boolean)
      .join(" ")
  )
}
