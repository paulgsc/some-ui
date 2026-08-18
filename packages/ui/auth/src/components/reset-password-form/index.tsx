import { useMemo } from "react"
import type { FC } from "react"
import { AuthError } from "@auth/components/auth-error"
import { PasswordField } from "@auth/components/password-field"
import { AuthSubmitButton } from "@auth/components/submit-button"
import { useAuthForm } from "@auth/hooks/use-auth-form"
import { PASSWORD_HINT, resetPasswordSchema } from "@auth/lib/schemas"
import type { ResetPasswordValues } from "@auth/lib/schemas"
import type { AuthFormStatusProps } from "@auth/types/auth"

export type ResetPasswordFormProps = AuthFormStatusProps & {
  onSubmit: (values: ResetPasswordValues) => void
  /**
   * Shown read-only above the fields so the user can see which account they
   * are resetting. Optional — the reset token identifies the account, and the
   * caller may not want to echo an address from a URL back onto the page.
   */
  email?: string
}

/**
 * Step two of password reset: choose the new password.
 *
 * The reset token is not a prop and never reaches this component. It arrives in
 * the URL the caller routed on, and the caller sends it with the request — the
 * form's output is a password and nothing else, so there is no path by which a
 * token ends up in component state or a re-render.
 */
export const ResetPasswordForm: FC<ResetPasswordFormProps> = ({
  onSubmit,
  email,
  pending = false,
  error = null,
}) => {
  const initialValues = useMemo(
    (): ResetPasswordValues => ({ password: "", confirmPassword: "" }),
    []
  )

  const { values, errors, update, handleSubmit } = useAuthForm({
    schema: resetPasswordSchema,
    initialValues,
    onSubmit,
  })

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <AuthError message={error} title="Could not reset your password" />

      {email ? (
        <p className="text-muted-foreground text-sm">
          Setting a new password for{" "}
          <span className="font-medium">{email}</span>
        </p>
      ) : null}

      <PasswordField
        id="reset-password"
        label="New password"
        value={values.password}
        onValueChange={(password) => update({ password })}
        error={errors.get("password")}
        hint={PASSWORD_HINT}
        autoComplete="new-password"
        disabled={pending}
        required
      />

      <PasswordField
        id="reset-confirm-password"
        label="Confirm new password"
        value={values.confirmPassword}
        onValueChange={(confirmPassword) => update({ confirmPassword })}
        error={errors.get("confirmPassword")}
        autoComplete="new-password"
        disabled={pending}
        required
      />

      <AuthSubmitButton pending={pending} pendingLabel="Saving new password">
        Save new password
      </AuthSubmitButton>
    </form>
  )
}
