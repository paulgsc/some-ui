/**
 * — composable, type-safe keyboard shortcut system
 *
 * Completely decoupled from any UI component. A KeyBinding instance
 * owns one combo → callback mapping. Dispose when done.
 *
 * Usage:
 *   const kb = new KeyBinding({ key: "b", alt: true }, () => toggle())
 *   kb.mount()
 *   // later:
 *   kb.dispose()
 *
 * Update the combo without recreating:
 *   kb.setCombo({ key: "b", ctrl: true })
 */

export type KeyCombo = {
  key: string // e.g. "b", "F2", "Escape" — matches KeyboardEvent.key
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  meta?: boolean
}

export type KeyBindingCallback = (event: KeyboardEvent) => void

function matches(event: KeyboardEvent, combo: KeyCombo): boolean {
  if (event.key.toLowerCase() !== combo.key.toLowerCase()) return false
  if (!!combo.ctrl !== event.ctrlKey) return false
  if (!!combo.alt !== event.altKey) return false
  if (!!combo.shift !== event.shiftKey) return false
  if (!!combo.meta !== event.metaKey) return false
  return true
}

export class KeyBinding {
  private combo: KeyCombo
  private callback: KeyBindingCallback
  private handler: (e: KeyboardEvent) => void
  private mounted = false

  constructor(combo: KeyCombo, callback: KeyBindingCallback) {
    this.combo = combo
    this.callback = callback
    this.handler = (e: KeyboardEvent): void => {
      // Ignore when typing in an input
      const { target } = e
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return

      if (matches(e, this.combo)) {
        e.preventDefault()
        this.callback(e)
      }
    }
  }

  setCombo(combo: KeyCombo): void {
    this.combo = combo
  }

  mount(): void {
    if (this.mounted) return
    document.addEventListener("keydown", this.handler)
    this.mounted = true
  }

  dispose(): void {
    document.removeEventListener("keydown", this.handler)
    this.mounted = false
  }

  /** Human-readable combo string for display */
  describe(): string {
    const parts: Array<string> = []
    if (this.combo.ctrl) parts.push("Ctrl")
    if (this.combo.alt) parts.push("Alt")
    if (this.combo.shift) parts.push("Shift")
    if (this.combo.meta) parts.push("⌘")
    parts.push(this.combo.key.toUpperCase())
    return parts.join("+")
  }
}
