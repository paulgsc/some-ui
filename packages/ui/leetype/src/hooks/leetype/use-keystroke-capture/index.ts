import type { RefObject } from "react"
import { useEffect } from "react"

type UseKeystrokeCaptureOptions = {
  /** One printable character the player produced. */
  onKey: (key: string) => void
  onBackspace: () => void
  /**
   * Flip the manual-reveal override — the escape hatch for a player who
   * does not want to wait for their own typing to earn a reveal. Bound to
   * Tab: layout is the machine's job (see the Enter/Tab note below), which
   * already leaves Tab permanently claimed and doing nothing, so this gives
   * a no-op key a job instead of asking the player to learn a new chord.
   */
  onToggleReveal: () => void
  /** While false, every event is left alone. */
  enabled: boolean
}

/**
 * Turn a focused element into a keystroke source for the typing engine.
 *
 * The engine is fed discrete keystrokes, not a text buffer — under the
 * overlaid single-card layout the input has no text of its own to mirror,
 * since indentation is auto-skipped and the caret is owned by the engine.
 * So the element's value is never allowed to change: every event that would
 * edit it is intercepted and forwarded as a command instead.
 *
 * Two listeners, deliberately:
 *
 * - `keydown` covers physical keyboards, and is where Enter/Tab get
 *   swallowed so they neither insert text nor move focus out of the card.
 *   Preventing the default there stops `beforeinput` from ever firing for
 *   the same key, so nothing is double-counted.
 * - `beforeinput` catches what `keydown` cannot describe: soft keyboards
 *   and IME composition, which report `key: "Unidentified"` but do carry
 *   the inserted text on the input event.
 *
 * Modifier chords (⌘/Ctrl/Alt) are left alone so browser and OS shortcuts
 * keep working while the card has focus.
 *
 * Tab carries one more job on top of being swallowed: it toggles the
 * manual-reveal override (`onToggleReveal`). It is never owed as a
 * keystroke and was already unconditionally claimed and focus-trapped, so
 * repurposing its no-op into the toggle costs nothing — no new chord to
 * learn, and no risk of colliding with a character the exercise expects.
 * `event.repeat` is checked so holding the key down fires the toggle
 * exactly once per physical press rather than once per repeat event.
 */
export function useKeystrokeCapture(
  ref: RefObject<HTMLTextAreaElement | null>,
  { onKey, onBackspace, onToggleReveal, enabled }: UseKeystrokeCaptureOptions
): void {
  useEffect(() => {
    const element = ref.current
    if (!element || !enabled) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return

      if (event.key === "Backspace") {
        event.preventDefault()
        onBackspace()
        return
      }

      // Enter is never owed, so it is swallowed rather than scored.
      if (event.key === "Enter") {
        event.preventDefault()
        return
      }

      // Tab must not walk focus out of the card mid-run either way, so it
      // stays swallowed — but it is also the reveal toggle, guarded against
      // key-repeat so one held-down press cannot fire it more than once.
      if (event.key === "Tab") {
        event.preventDefault()
        if (!event.repeat) onToggleReveal()
        return
      }

      if (Array.from(event.key).length === 1) {
        event.preventDefault()
        onKey(event.key)
      }
    }

    const handleBeforeInput = (event: InputEvent): void => {
      event.preventDefault()

      if (event.inputType === "deleteContentBackward") {
        onBackspace()
        return
      }

      if (
        event.inputType === "insertText" ||
        event.inputType === "insertCompositionText"
      ) {
        for (const key of Array.from(event.data ?? "")) {
          onKey(key)
        }
      }
    }

    element.addEventListener("keydown", handleKeyDown)
    element.addEventListener("beforeinput", handleBeforeInput)

    return (): void => {
      element.removeEventListener("keydown", handleKeyDown)
      element.removeEventListener("beforeinput", handleBeforeInput)
    }
  }, [ref, onKey, onBackspace, onToggleReveal, enabled])
}
