import { useMemo } from "react"
import type { FC, ReactNode } from "react"

import { useAuthForm } from "../../hooks/use-auth-form"
import { PASSWORD_HINT, signUpSchema } from "../../lib/schemas"
import type { SignUpValues } from "../../lib/schemas"
import type { AuthFormStatusProps, OAuthProvider } from "../../types/auth"
import { AuthError } from "../auth-error"
import { AuthField } from "../auth-field"
import { CheckboxField } from "../checkbox-field"
import { AuthDivider, OAuthButtons } from "../oauth-buttons"
import { PasswordField } from "../password-field"
import { AuthSubmitButton } from "../submit-button"

export type SignUpFormProps = AuthFormStatusProps & {
  onSubmit: (values: SignUpValues) => void
  providers?: ReadonlyArray<OAuthProvider>
  onProviderSelect?: (providerId: string) => void
  /** Terms/privacy wording, so the links stay the host app's to route. */
  termsLabel?: ReactNode
}

export const SignUpForm: FC<SignUpFormProps> = ({
  onSubmit,
  providers = [],
  onProviderSelect,
  termsLabel = "I agree to the terms of service and privacy policy",
  pending = false,
  error = null,
}) => {
  const initialValues = useMemo(
    (): SignUpValues => ({
      email: "",
      password: "",
      confirmPassword: "",
      acceptedTerms: false,
    }),
    []
  )

  const { values, errors, update, handleSubmit } = useAuthForm({
    schema: signUpSchema,
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
          <AuthDivider label="or sign up with email" />
        </>
      ) : null}

      <AuthError message={error} title="Could not create your account" />

      <AuthField
        id="sign-up-email"
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
        id="sign-up-password"
        label="Password"
        value={values.password}
        onValueChange={(password) => update({ password })}
        error={errors.get("password")}
        hint={PASSWORD_HINT}
        autoComplete="new-password"
        disabled={pending}
        required
      />

      <PasswordField
        id="sign-up-confirm-password"
        label="Confirm password"
        value={values.confirmPassword}
        onValueChange={(confirmPassword) => update({ confirmPassword })}
        error={errors.get("confirmPassword")}
        autoComplete="new-password"
        disabled={pending}
        required
      />

      <CheckboxField
        id="sign-up-terms"
        label={termsLabel}
        checked={values.acceptedTerms}
        onCheckedChange={(acceptedTerms) => update({ acceptedTerms })}
        error={errors.get("acceptedTerms")}
        disabled={pending}
      />

      <AuthSubmitButton pending={pending} pendingLabel="Creating account">
        Create account
      </AuthSubmitButton>
    </form>
  )
}
