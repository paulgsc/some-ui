import type { JSX, KeyboardEvent as ReactKeyboardEvent, RefObject } from "react"
import { useEffect } from "react"
import { Button, Input } from "@some-ui/shared"
import { Search, X } from "lucide-react"

/** The key that puts the cursor in the field from anywhere on the page. */
const FOCUS_HOTKEY = "/"

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
 * `/` focuses the field from anywhere on the surface.
 *
 * Guarded against firing while someone is typing into something else - `/` is
 * a character before it is a shortcut, and stealing focus mid-word is worse
 * than having no shortcut at all. Modifier chords are left alone for the same
 * reason.
 */
export function useSearchHotkey(
  inputRef: RefObject<HTMLInputElement | null>,
  enabled = true
): void {
  useEffect(() => {
    if (!enabled) return undefined

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== FOCUS_HOTKEY) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return

      event.preventDefault()
      inputRef.current?.focus()
    }

    window.addEventListener("keydown", handleKeyDown)
    return (): void => window.removeEventListener("keydown", handleKeyDown)
  }, [inputRef, enabled])
}

type ActivitySearchFieldProps = {
  value: string
  onChange: (value: string) => void
  onKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void
  inputRef: RefObject<HTMLInputElement | null>
  placeholder?: string
  /** Wired to the listbox this field drives, when it drives one. */
  controls?: {
    listboxId: string
    activeOptionId: string | undefined
    expanded: boolean
  }
}

/**
 * The one search field, shared by the dashboard launcher and the composer's
 * picker.
 *
 * The two use its results differently - the launcher overlays them, the
 * picker narrows a paged grid - but the field itself is the same affordance
 * in both, down to the `/` shortcut, and there is no reason for a person to
 * learn it twice.
 */
export const ActivitySearchField = ({
  value,
  onChange,
  onKeyDown,
  inputRef,
  placeholder = "Search activities",
  controls,
}: ActivitySearchFieldProps): JSX.Element => {
  return (
    <div className="relative">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        ref={inputRef}
        type="search"
        role={controls ? "combobox" : undefined}
        aria-expanded={controls?.expanded}
        aria-controls={controls?.listboxId}
        aria-activedescendant={controls?.activeOptionId}
        aria-autocomplete={controls ? "list" : undefined}
        aria-label={placeholder}
        placeholder={`${placeholder}  (press / )`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        className="pr-9 pl-9"
      />
      {value.length > 0 && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            onChange("")
            inputRef.current?.focus()
          }}
          aria-label="Clear search"
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 size-7 -translate-y-1/2 p-0"
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  )
}
