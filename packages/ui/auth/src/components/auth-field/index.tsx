import type { FC, ReactNode } from "react"
import { cn } from "@some-ui/core-utils"
import { Input, Label } from "@some-ui/shared"

export type AuthFieldProps = {
  /** Must be unique on the page — label, hint and error all derive from it. */
  id: string
  label: string
  value: string
  onValueChange: (value: string) => void
  type?: "text" | "email" | "password" | "tel"
  /** Validation message for this field. Presence flips `aria-invalid`. */
  error?: string
  hint?: ReactNode
  /**
   * Worth setting on every auth field. `username`, `current-password`,
   * `new-password` and `one-time-code` are what let password managers fill
   * and — for `new-password` — offer to generate.
   */
  autoComplete?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  /** Trailing control on the label row, e.g. a "Forgot password?" link. */
  labelAction?: ReactNode
  /** Control layered over the input's trailing edge, e.g. a reveal toggle. */
  endAdornment?: ReactNode
  inputClassName?: string
}

/**
 * Label + input + hint + error, wired together for screen readers.
 *
 * The field renders its own input rather than taking one as a child. A
 * children-based version would leave every caller to re-derive the `id`,
 * `aria-invalid` and `aria-describedby` wiring by hand, which is exactly the
 * part that gets skipped — and the accessible error association is the whole
 * reason this component exists.
 */
export const AuthField: FC<AuthFieldProps> = ({
  id,
  label,
  value,
  onValueChange,
  type = "text",
  error,
  hint,
  autoComplete,
  placeholder,
  disabled,
  required,
  labelAction,
  endAdornment,
  inputClassName,
}) => {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  // Built as a list so the two optional ids compose without producing the
  // stray "undefined" that string concatenation would leave in the attribute.
  const describedBy: Array<string> = []
  if (hint) describedBy.push(hintId)
  if (error) describedBy.push(errorId)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {labelAction}
      </div>

      <div className="relative">
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            describedBy.length > 0 ? describedBy.join(" ") : undefined
          }
          className={cn(endAdornment ? "pr-10" : undefined, inputClassName)}
        />
        {endAdornment ? (
          <div className="absolute inset-y-0 right-0 flex items-center pr-1">
            {endAdornment}
          </div>
        ) : null}
      </div>

      {hint ? (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  )
}
