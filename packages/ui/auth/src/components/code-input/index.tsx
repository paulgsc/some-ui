import { useEffect, useMemo, useRef } from "react"
import type { ChangeEvent, ClipboardEvent, FC, KeyboardEvent } from "react"
import { VERIFICATION_CODE_LENGTH } from "@auth/lib/schemas"
import { cn } from "@some-ui/core-utils"
import { Label } from "@some-ui/shared"

const DIGITS_ONLY = /\D/g

/** Focuses a sibling node, if it turned out to be one of our slots. */
const focusSlot = (element: Element | null): void => {
  if (element instanceof HTMLInputElement) element.focus()
}

export type CodeInputProps = {
  id: string
  label: string
  /** The code so far. Shorter than `length` means partially entered. */
  value: string
  onValueChange: (value: string) => void
  /** Fired once the last digit lands, by typing or by paste. */
  onComplete?: (value: string) => void
  length?: number
  error?: string
  disabled?: boolean
  /** Focus the first slot on mount. This step exists to be typed into. */
  focusOnMount?: boolean
}

/**
 * Segmented one-time-code entry.
 *
 * One `<input>` per digit, and focus moves by walking `nextElementSibling`
 * rather than indexing a ref array — this repo's ESLint config bans computed
 * member access outright (`no-restricted-syntax`), which takes `refs[i]` off
 * the table. Sibling traversal is arguably the better answer anyway: the DOM
 * already holds the ordering, so there is no second copy of it to keep in sync.
 *
 * Every slot carries `autoComplete="one-time-code"`, which is what makes iOS
 * and Android offer the SMS/email code above the keyboard, and paste is handled
 * on the whole group so pasting `123456` into any slot fills all of them —
 * without that, a pasted code lands entirely in one box and the field looks
 * broken.
 */
export const CodeInput: FC<CodeInputProps> = ({
  id,
  label,
  value,
  onValueChange,
  onComplete,
  length = VERIFICATION_CODE_LENGTH,
  error,
  disabled,
  focusOnMount = false,
}) => {
  const errorId = `${id}-error`
  const groupRef = useRef<HTMLDivElement>(null)

  // Stable per-slot keys. Index-derived, but computed once and not passed as
  // the key expression itself, so the list has real identities rather than
  // positions that shift under reconciliation.
  const slotIds = useMemo(
    (): Array<string> =>
      Array.from({ length }, (_, slot) => `${id}-slot-${slot}`),
    [id, length]
  )

  useEffect(() => {
    if (!focusOnMount) return
    focusSlot(groupRef.current?.firstElementChild ?? null)
  }, [focusOnMount])

  const commit = (next: string, focusTarget: Element | null): void => {
    onValueChange(next)
    focusSlot(focusTarget)
    if (next.length === length) onComplete?.(next)
  }

  const handleSlotChange = (
    event: ChangeEvent<HTMLInputElement>,
    index: number
  ): void => {
    const digit = event.target.value.replace(DIGITS_ONLY, "").at(-1) ?? ""

    const digits = Array.from(
      { length },
      (_, slot): string => value.at(slot) ?? ""
    )
    const next = digits
      .map((current, slot) => (slot === index ? digit : current))
      .join("")

    // Advance only when a digit went in — clearing a slot should leave the
    // caret where the user is deleting.
    commit(next, digit === "" ? null : event.target.nextElementSibling)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    const input = event.currentTarget

    // Backspace on an already-empty slot steps back and clears the previous
    // one, which is what every native segmented input does.
    if (event.key === "Backspace" && input.value === "") {
      event.preventDefault()
      onValueChange(value.slice(0, -1))
      focusSlot(input.previousElementSibling)
      return
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault()
      focusSlot(input.previousElementSibling)
      return
    }

    if (event.key === "ArrowRight") {
      event.preventDefault()
      focusSlot(input.nextElementSibling)
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>): void => {
    event.preventDefault()
    const pasted = event.clipboardData
      .getData("text")
      .replace(DIGITS_ONLY, "")
      .slice(0, length)
    if (pasted.length === 0) return

    commit(
      pasted,
      groupRef.current?.children.item(Math.min(pasted.length, length - 1)) ??
        null
    )
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={slotIds.at(0)}>{label}</Label>

      <div ref={groupRef} className="flex gap-2">
        {slotIds.map((slotId, index) => (
          <input
            key={slotId}
            id={slotId}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            disabled={disabled}
            value={value.at(index) ?? ""}
            onChange={(event) => handleSlotChange(event, index)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={(event) => event.target.select()}
            aria-label={`Digit ${index + 1} of ${length}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={cn(
              "border-input bg-background ring-offset-background focus-visible:ring-ring size-10 rounded-md border text-center text-lg font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              error ? "border-destructive" : undefined
            )}
          />
        ))}
      </div>

      {error ? (
        <p id={errorId} className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  )
}
