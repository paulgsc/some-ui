import { useState } from "react"
import type { FC } from "react"
import { Eye, EyeOff } from "lucide-react"

import type { AuthFieldProps } from "../auth-field"
import { AuthField } from "../auth-field"

export type PasswordFieldProps = Omit<
  AuthFieldProps,
  "type" | "endAdornment" | "inputClassName"
>

/**
 * `AuthField` plus a reveal toggle.
 *
 * Visibility is local state and starts hidden — nothing about which field was
 * revealed is worth lifting to the caller. The toggle is `type="button"` so it
 * cannot submit the form, and its accessible name flips with the state, since
 * an unchanging "Toggle password" tells a screen-reader user nothing about
 * what pressing it will do.
 */
export const PasswordField: FC<PasswordFieldProps> = (props) => {
  const [visible, setVisible] = useState(false)

  return (
    <AuthField
      {...props}
      type={visible ? "text" : "password"}
      endAdornment={
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          disabled={props.disabled}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      }
    />
  )
}
