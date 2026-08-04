import type { FC, ReactNode } from "react"
import { cn } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import { LoaderCircle } from "lucide-react"

export type AuthSubmitButtonProps = {
  children: ReactNode
  pending?: boolean
  disabled?: boolean
  /** Announced while pending. Defaults to the resting label. */
  pendingLabel?: string
  className?: string
}

/**
 * Full-width submit with an in-flight state.
 *
 * The label stays put while pending and only the spinner appears. Swapping the
 * text for "Signing in…" resizes the button under the cursor at the exact
 * moment the user is most likely to click again.
 *
 * `aria-busy` plus `disabled` covers both halves: the disable stops the second
 * submit, and `aria-busy` is what tells a screen reader why nothing happened.
 */
export const AuthSubmitButton: FC<AuthSubmitButtonProps> = ({
  children,
  pending = false,
  disabled = false,
  pendingLabel,
  className,
}) => (
  <Button
    type="submit"
    disabled={pending || disabled}
    aria-busy={pending}
    aria-label={pending ? pendingLabel : undefined}
    className={cn("w-full", className)}
  >
    {pending ? (
      <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden="true" />
    ) : null}
    {children}
  </Button>
)
