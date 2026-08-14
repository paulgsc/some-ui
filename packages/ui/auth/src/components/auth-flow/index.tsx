import type { FC } from "react"
import { Mail } from "lucide-react"

import type {
  RequestResetValues,
  ResetPasswordValues,
  SignInValues,
  SignUpValues,
  VerifyCodeValues,
} from "../../lib/schemas"
import type {
  AuthFlowStep,
  AuthFormStatusProps,
  OAuthProvider,
} from "../../types/auth"
import { assertNever } from "../../utils/error"
import { AuthCard } from "../auth-card"
import { PasskeyEnrollment } from "../passkey-enrollment"
import { RequestPasswordResetForm } from "../request-password-reset-form"
import { ResetPasswordForm } from "../reset-password-form"
import { SignInForm } from "../sign-in-form"
import { SignUpForm } from "../sign-up-form"
import { VerifyCodeForm } from "../verify-code-form"

export type AuthFlowProps = AuthFormStatusProps & {
  /** Controlled. See the note below on why this is not internal state. */
  step: AuthFlowStep
  onStepChange: (step: AuthFlowStep) => void

  onSignIn: (values: SignInValues) => void
  onSignUp: (values: SignUpValues) => void
  onRequestReset: (values: RequestResetValues) => void
  onResetPassword: (values: ResetPasswordValues) => void
  onVerifyCode: (values: VerifyCodeValues) => void
  onResendCode?: () => void
  /** Adapter callbacks: this package never calls the WebAuthn browser API. */
  onPasskeySignIn?: () => void
  onCreatePasskey?: () => void
  onSkipPasskey?: () => void
  passkeyAvailable?: boolean
  /** Makes passkey the sole initial action; legacy methods remain a fallback. */
  passkeyFirst?: boolean

  providers?: ReadonlyArray<OAuthProvider>
  onProviderSelect?: (providerId: string) => void

  /**
   * The address in play. Prefills sign-in, and is echoed on the verify and
   * reset-sent steps. The caller owns it because it survives step changes.
   */
  email?: string
  productName?: string
}

/**
 * The whole workflow, one step at a time, in a card.
 *
 * `step` is a prop rather than internal state. These steps want to be URLs —
 * a password-reset email has to link straight to `reset-password`, and a user
 * who reloads mid-flow should land where they were — which means the router
 * owns the step. A component that owned it internally could not give it up, so
 * it never gets to own it. `useAuthFlow` from this package supplies the state
 * for consumers that have no router yet.
 *
 * `pending` and `error` are single props rather than per-step ones: exactly one
 * request is ever in flight, because it is the one the visible step just fired.
 */
export const AuthFlow: FC<AuthFlowProps> = ({
  step,
  onStepChange,
  onSignIn,
  onSignUp,
  onRequestReset,
  onResetPassword,
  onVerifyCode,
  onResendCode,
  providers = [],
  onProviderSelect,
  email,
  productName = "your account",
  pending = false,
  error = null,
  onPasskeySignIn,
  onCreatePasskey,
  onSkipPasskey,
  passkeyAvailable = false,
  passkeyFirst = false,
}) => {
  switch (step) {
    case "sign-in": {
      return (
        <AuthCard
          title="Sign in"
          description={
            passkeyFirst
              ? `Use your passkey to continue to ${productName}.`
              : `Welcome back to ${productName}.`
          }
          footer={
            <button
              type="button"
              onClick={() => onStepChange("sign-up")}
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              No account yet? Create one
            </button>
          }
        >
          <SignInForm
            onSubmit={onSignIn}
            onForgotPassword={() => onStepChange("request-reset")}
            providers={providers}
            onProviderSelect={onProviderSelect}
            defaultEmail={email}
            pending={pending}
            error={error}
            onPasskeySignIn={passkeyAvailable ? onPasskeySignIn : undefined}
            passkeyFirst={passkeyFirst}
          />
        </AuthCard>
      )
    }

    case "sign-up": {
      return (
        <AuthCard
          title="Create account"
          description={`Get started with ${productName}.`}
          footer={
            <button
              type="button"
              onClick={() => onStepChange("sign-in")}
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              Already have an account? Sign in
            </button>
          }
        >
          <SignUpForm
            onSubmit={onSignUp}
            providers={providers}
            onProviderSelect={onProviderSelect}
            pending={pending}
            error={error}
          />
        </AuthCard>
      )
    }

    case "verify-code": {
      return (
        <AuthCard title="Check your email" description="One more step.">
          <VerifyCodeForm
            onSubmit={onVerifyCode}
            destination={email}
            onResend={onResendCode}
            onBack={() => onStepChange("sign-in")}
            pending={pending}
            error={error}
          />
        </AuthCard>
      )
    }

    case "request-reset": {
      return (
        <AuthCard
          title="Reset password"
          description="We'll email you a link to set a new one."
        >
          <RequestPasswordResetForm
            onSubmit={onRequestReset}
            onBackToSignIn={() => onStepChange("sign-in")}
            defaultEmail={email}
            pending={pending}
            error={error}
          />
        </AuthCard>
      )
    }

    case "reset-sent": {
      return (
        <AuthCard title="Check your email">
          <div className="space-y-4 text-sm">
            <Mail className="text-muted-foreground size-8" aria-hidden="true" />
            <p className="text-muted-foreground">
              If an account exists for{" "}
              <span className="text-foreground font-medium">
                {email ?? "that address"}
              </span>
              , a reset link is on its way. The link expires shortly.
            </p>
            <button
              type="button"
              onClick={() => onStepChange("sign-in")}
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
            >
              Back to sign in
            </button>
          </div>
        </AuthCard>
      )
    }

    case "reset-password": {
      return (
        <AuthCard title="Set a new password">
          <ResetPasswordForm
            onSubmit={onResetPassword}
            email={email}
            pending={pending}
            error={error}
          />
        </AuthCard>
      )
    }

    case "passkey-enrollment": {
      return (
        <AuthCard
          title="Protect your account"
          description="Add a passkey for secure, passwordless sign-in."
        >
          <PasskeyEnrollment
            onCreate={onCreatePasskey}
            onSkip={onSkipPasskey}
            pending={pending}
            error={error}
          />
        </AuthCard>
      )
    }

    default: {
      return assertNever(step)
    }
  }
}
