import type { RefObject } from "react"
import { useEffect } from "react"

type UseKeystrokeCaptureOptions = {
  /** One printable character the player produced. */
  onKey: (key: string) => void
  onBackspace: () => void
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
 */
export function useKeystrokeCapture(
  ref: RefObject<HTMLTextAreaElement | null>,
  { onKey, onBackspace, enabled }: UseKeystrokeCaptureOptions
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

      // Layout is the machine's job now — Enter and Tab are never owed, so
      // they are swallowed rather than scored (and Tab must not walk focus
      // out of the card mid-run).
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
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
  }, [ref, onKey, onBackspace, enabled])
}
