import { useEffect, useState } from "react"

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  )
}

/**
 * One keybinding (`{`) toggles an editor overlay, per epic #693 story 6.
 *
 * Only listens while `active` - inert otherwise, so it never competes with
 * typing on surfaces that are not in an editable state - and it ignores
 * keystrokes aimed at a field, so `{` in a text input is a brace.
 *
 * Nothing here is specific to the live layout editor or to `apps/www`: it is
 * a `useState` and a window listener over zero app imports, which is why it
 * lives alongside `use-event-listener` and `use-interval` rather than in the
 * one component that happens to call it today (#759).
 */
export function useEditModeHotkey(active: boolean): [boolean, () => void] {
  const [rawEditMode, setRawEditMode] = useState(false)

  useEffect(() => {
    if (!active) return

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key.toLowerCase() !== "{" || e.metaKey || e.ctrlKey || e.altKey) {
        return
      }
      if (isTypingTarget(e.target)) return
      setRawEditMode((prev) => !prev)
    }

    window.addEventListener("keydown", handleKeyDown)
    return (): void => window.removeEventListener("keydown", handleKeyDown)
  }, [active])

  const toggle = (): void => setRawEditMode((prev) => !prev)

  // Inactive (no session playing) always reads as not editing, regardless
  // of whatever state a previous active session left behind.
  return [active && rawEditMode, toggle]
}
