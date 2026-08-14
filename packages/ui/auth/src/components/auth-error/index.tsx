import type { FC } from "react"
import { Alert, AlertDescription, AlertTitle } from "@some-ui/shared"
import { CircleAlert } from "lucide-react"

export type AuthErrorProps = {
  /** Server-supplied message. `null`/`undefined`/empty renders nothing. */
  message?: string | null
  title?: string
}

/**
 * Form-level failure banner.
 *
 * `aria-live="polite"` rather than `role="alert"`: the message appears after a
 * submit the user initiated, so it does not need to interrupt — and `Alert`
 * from `@some-ui/shared` already carries `role="alert"`, which on its own only
 * announces if the node is present when the region is first parsed. The live
 * region is what makes the announcement happen on a later mount.
 *
 * The message is rendered verbatim, which means the server owns its wording.
 * Sign-in failures should say "Email or password is incorrect" and never
 * distinguish the two — telling an attacker which half was right turns the
 * login form into an account-enumeration oracle.
 */
export const AuthError: FC<AuthErrorProps> = ({
  message,
  title = "Something went wrong",
}) => {
  if (!message) return null

  return (
    <Alert variant="destructive" aria-live="polite">
      <CircleAlert className="size-4" aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
