import { useMemo } from "react"
import type { FC } from "react"

import { useAuthForm } from "../../hooks/use-auth-form"
import { signInSchema } from "../../lib/schemas"
import type { SignInValues } from "../../lib/schemas"
import type { AuthFormStatusProps, OAuthProvider } from "../../types/auth"
import { AuthError } from "../auth-error"
import { AuthField } from "../auth-field"
import { CheckboxField } from "../checkbox-field"
import { AuthDivider, OAuthButtons } from "../oauth-buttons"
import { PasswordField } from "../password-field"
import { AuthSubmitButton } from "../submit-button"

export type SignInFormProps = AuthFormStatusProps & {
  onSubmit: (values: SignInValues) => void
  /** Omit to hide the link entirely, for deployments with no reset flow. */
  onForgotPassword?: () => void
  providers?: ReadonlyArray<OAuthProvider>
  onProviderSelect?: (providerId: string) => void
  /** Prefills the email — e.g. returning from a verification step. */
  defaultEmail?: string
}

export const SignInForm: FC<SignInFormProps> = ({
  onSubmit,
  onForgotPassword,
  providers = [],
  onProviderSelect,
  defaultEmail = "",
  pending = false,
  error = null,
}) => {
  const initialValues = useMemo(
    (): SignInValues => ({
      email: defaultEmail,
      password: "",
      rememberMe: false,
    }),
    [defaultEmail]
  )

  const { values, errors, update, handleSubmit } = useAuthForm({
    schema: signInSchema,
    initialValues,
    onSubmit,
  })

  const showProviders = providers.length > 0 && onProviderSelect !== undefined

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {showProviders ? (
        <>
          <OAuthButtons
            providers={providers}
            onSelect={onProviderSelect}
            disabled={pending}
          />
          <AuthDivider label="or continue with email" />
        </>
      ) : null}

      <AuthError message={error} title="Could not sign in" />

      <AuthField
        id="sign-in-email"
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

      <PasswordField
        id="sign-in-password"
        label="Password"
        value={values.password}
        onValueChange={(password) => update({ password })}
        error={errors.get("password")}
        autoComplete="current-password"
        disabled={pending}
        required
        labelAction={
          onForgotPassword ? (
            <button
              type="button"
              onClick={onForgotPassword}
              disabled={pending}
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline disabled:opacity-50"
            >
              Forgot password?
            </button>
          ) : undefined
        }
      />

      <CheckboxField
        id="sign-in-remember"
        label="Keep me signed in on this device"
        checked={values.rememberMe}
        onCheckedChange={(rememberMe) => update({ rememberMe })}
        disabled={pending}
      />

      <AuthSubmitButton pending={pending} pendingLabel="Signing in">
        Sign in
      </AuthSubmitButton>
    </form>
  )
}
