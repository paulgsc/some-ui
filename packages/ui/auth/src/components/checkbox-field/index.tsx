import type { FC, ReactNode } from "react"
import { Label } from "@some-ui/shared"

export type CheckboxFieldProps = {
  id: string
  label: ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  error?: string
  disabled?: boolean
}

/**
 * Native checkbox for "remember me" and terms acceptance.
 *
 * `@some-ui/shared` has no checkbox primitive, and this is the only workspace
 * that needs one — per `packages/SHARED_WORKSPACE_DOCTRINE.md` §2 that makes it
 * local code, not a hoist. If a second workspace genuinely needs a checkbox,
 * the doctrine's defense test applies then, and it moves as a Radix-backed
 * primitive rather than this.
 *
 * A native input rather than a styled `div` with `role="checkbox"`: it comes
 * with keyboard activation, the indeterminate/checked mapping, and form
 * participation already correct.
 */
export const CheckboxField: FC<CheckboxFieldProps> = ({
  id,
  label,
  checked,
  onCheckedChange,
  error,
  disabled,
}) => {
  const errorId = `${id}-error`

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="border-input text-primary focus-visible:ring-ring mt-0.5 size-4 shrink-0 rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Label
          htmlFor={id}
          className="text-muted-foreground text-sm font-normal"
        >
          {label}
        </Label>
      </div>

      {error ? (
        <p id={errorId} className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  )
}
