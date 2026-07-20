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
 * One keybinding (`E`) toggles the live layout editor overlay, per epic
 * #693 story 6. Only listens while `active` (a session is actually
 * playing) - inert everywhere else, so it never competes with typing on
 * other routes.
 */
export function useEditModeHotkey(active: boolean): [boolean, () => void] {
  const [rawEditMode, setRawEditMode] = useState(false)

  useEffect(() => {
    if (!active) return

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key.toLowerCase() !== "e" || e.metaKey || e.ctrlKey || e.altKey) {
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
