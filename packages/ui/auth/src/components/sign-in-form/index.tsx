import { useMemo, useState } from "react"
import type { FC } from "react"
import { AuthError } from "@auth/components/auth-error"
import { AuthField } from "@auth/components/auth-field"
import { CheckboxField } from "@auth/components/checkbox-field"
import { AuthDivider, OAuthButtons } from "@auth/components/oauth-buttons"
import { PasskeyButton } from "@auth/components/passkey-button"
import { PasswordField } from "@auth/components/password-field"
import { AuthSubmitButton } from "@auth/components/submit-button"
import { useAuthForm } from "@auth/hooks/use-auth-form"
import { signInSchema } from "@auth/lib/schemas"
import type { SignInValues } from "@auth/lib/schemas"
import type { AuthFormStatusProps, OAuthProvider } from "@auth/types/auth"

export type SignInFormProps = AuthFormStatusProps & {
  onSubmit: (values: SignInValues) => void
  /** Omit to hide the link entirely, for deployments with no reset flow. */
  onForgotPassword?: () => void
  providers?: ReadonlyArray<OAuthProvider>
  onProviderSelect?: (providerId: string) => void
  /** Prefills the email — e.g. returning from a verification step. */
  defaultEmail?: string
  /** Omit to keep passkey sign-in out of this deployment. */
  onPasskeySignIn?: () => void
  /** Keeps email, password, and OAuth behind an explicit fallback action. */
  passkeyFirst?: boolean
  /** Hides every fallback method for passkey-only deployments. */
  passkeyOnly?: boolean
}

export const SignInForm: FC<SignInFormProps> = ({
  onSubmit,
  onForgotPassword,
  providers = [],
  onProviderSelect,
  defaultEmail = "",
  pending = false,
  error = null,
  onPasskeySignIn,
  passkeyFirst = false,
  passkeyOnly = false,
}) => {
  const [fallbackVisible, setFallbackVisible] = useState(false)
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
  const showFallback =
    !passkeyOnly &&
    (!passkeyFirst || fallbackVisible || onPasskeySignIn === undefined)

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <AuthError message={error} title="Could not sign in" />

      {onPasskeySignIn ? (
        <>
          <PasskeyButton onClick={onPasskeySignIn} pending={pending} />
          {showFallback ? (
            <AuthDivider label="or use a backup method" />
          ) : !passkeyOnly ? (
            <button
              type="button"
              onClick={() => setFallbackVisible(true)}
              disabled={pending}
              className="text-muted-foreground hover:text-foreground w-full text-sm underline-offset-4 hover:underline disabled:opacity-50"
            >
              Use email or another method
            </button>
          ) : null}
        </>
      ) : null}
      {showFallback ? (
        <div className="space-y-4">
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
            Sign in with email
          </AuthSubmitButton>
        </div>
      ) : null}
    </form>
  )
}
