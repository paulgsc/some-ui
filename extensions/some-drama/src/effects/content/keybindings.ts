// Keyboard shortcut module for the drama overlay content script.
//
// Shortcut: Alt + Shift + D
//   - Triggers instantly on keydown.
//   - Safe from native browser conflicts across Chrome and Firefox.
//   - Ergonomic and does not require complex state machines or timeouts.

type KeybindingHandlers = {
  toggleVisibility: () => void
}

export function installKeybindings(handlers: KeybindingHandlers): void {
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    // Ignore events from inputs / textareas / contenteditable elements
    if (!(e.target instanceof HTMLElement)) return
    if (
      e.target.tagName === "INPUT" ||
      e.target.tagName === "TEXTAREA" ||
      e.target.isContentEditable
    ) {
      return
    }

    // Modern browsers use e.key (handles casing gracefully)
    const isD = e.key.toLowerCase() === "d"

    // Match exactly Alt + Shift + D (and ensure Ctrl/Meta aren't accidentally held)
    if (isD && e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      e.stopPropagation() // Stop the event from bubbling up further
      handlers.toggleVisibility()
    }
  })
}
