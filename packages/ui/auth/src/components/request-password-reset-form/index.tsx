import { useMemo } from "react"
import type { FC } from "react"
import { ArrowLeft } from "lucide-react"

import { useAuthForm } from "../../hooks/use-auth-form"
import { requestResetSchema } from "../../lib/schemas"
import type { RequestResetValues } from "../../lib/schemas"
import type { AuthFormStatusProps } from "../../types/auth"
import { AuthError } from "../auth-error"
import { AuthField } from "../auth-field"
import { AuthSubmitButton } from "../submit-button"

export type RequestPasswordResetFormProps = AuthFormStatusProps & {
  onSubmit: (values: RequestResetValues) => void
  onBackToSignIn?: () => void
  defaultEmail?: string
}

/**
 * Step one of password reset: ask for the address.
 *
 * The caller should move to the `reset-sent` step on *any* completed request,
 * including one for an address that has no account. Reporting "no account with
 * that email" here is the same enumeration leak as a specific sign-in error,
 * just on a page nobody thinks to check.
 */
export const RequestPasswordResetForm: FC<RequestPasswordResetFormProps> = ({
  onSubmit,
  onBackToSignIn,
  defaultEmail = "",
  pending = false,
  error = null,
}) => {
  const initialValues = useMemo(
    (): RequestResetValues => ({ email: defaultEmail }),
    [defaultEmail]
  )

  const { values, errors, update, handleSubmit } = useAuthForm({
    schema: requestResetSchema,
    initialValues,
    onSubmit,
  })

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <AuthError message={error} title="Could not send the link" />

      <AuthField
        id="request-reset-email"
        label="Email"
        type="email"
        value={values.email}
        onValueChange={(email) => update({ email })}
        error={errors.get("email")}
        autoComplete="username"
        placeholder="you@example.com"
        disabled={pending}
        required
      />

      <AuthSubmitButton pending={pending} pendingLabel="Sending reset link">
        Send reset link
      </AuthSubmitButton>

      {onBackToSignIn ? (
        <button
          type="button"
          onClick={onBackToSignIn}
          disabled={pending}
          className="text-muted-foreground hover:text-foreground mx-auto flex items-center gap-1 text-xs underline-offset-4 hover:underline disabled:opacity-50"
        >
          <ArrowLeft className="size-3" aria-hidden="true" />
          Back to sign in
        </button>
      ) : null}
    </form>
  )
}
