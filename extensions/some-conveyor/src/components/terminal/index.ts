/**
 * terminal — pure presentational primitives for the "instrumentation panel"
 * aesthetic. No I/O, no app state, no browser.* — just DOM + inline styles
 * bound to theme CSS variables. Every face view is composed from these.
 */

export function terminalEl(tag: string, cls?: string): HTMLElement {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  Object.assign(el.style, {
    fontFamily: "var(--face-font, 'Courier New', monospace)",
    fontSize: "var(--face-font-size, 11px)",
    lineHeight: "var(--face-line-height, 1.5)",
    color: "var(--face-text, #4a7c4a)",
    padding: "0",
    margin: "0",
    background: "transparent",
    border: "none",
    width: "100%",
  })
  return el
}

export function terminalLabel(text: string): HTMLElement {
  const el = terminalEl("span", "sc-face-label")
  el.style.color = "var(--face-text-secondary, #2a4a2a)"
  el.style.display = "block"
  el.textContent = text
  return el
}

export function terminalValue(text: string, bright = false): HTMLElement {
  const el = terminalEl("span", "sc-face-value")
  el.style.color = bright
    ? "var(--face-text-active, #00ff41)"
    : "var(--face-text, #4a7c4a)"
  el.style.fontSize = bright ? "18px" : "var(--face-font-size, 11px)"
  el.style.fontWeight = bright ? "bold" : "normal"
  el.style.display = "block"
  el.textContent = text
  return el
}

export function terminalRow(): HTMLElement {
  const row = terminalEl("div", "sc-face-row")
  Object.assign(row.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  })
  return row
}

/** Vertical stack with the standard face padding. */
export function faceContainer(cls: string): HTMLElement {
  const el = terminalEl("div", cls)
  Object.assign(el.style, {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: "12px",
    gap: "4px",
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
  })
  return el
}
