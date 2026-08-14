import { useMemo } from "react"
import type { FC } from "react"
import { ArrowLeft } from "lucide-react"

import { useAuthForm } from "../../hooks/use-auth-form"
import { VERIFICATION_CODE_LENGTH, verifyCodeSchema } from "../../lib/schemas"
import type { VerifyCodeValues } from "../../lib/schemas"
import type { AuthFormStatusProps } from "../../types/auth"
import { AuthError } from "../auth-error"
import { CodeInput } from "../code-input"
import { AuthSubmitButton } from "../submit-button"

export type VerifyCodeFormProps = AuthFormStatusProps & {
  onSubmit: (values: VerifyCodeValues) => void
  /** Where the code went, echoed back so the user can spot a typo'd address. */
  destination?: string
  onResend?: () => void
  /** Caller-owned, so the resend rate limit stays with the thing enforcing it. */
  canResend?: boolean
  onBack?: () => void
  /**
   * Submit as soon as the last digit lands. On by default — it is what makes a
   * pasted code feel instant. Turn it off where a wrong submit is expensive,
   * e.g. a backend that counts attempts aggressively.
   */
  autoSubmit?: boolean
}

/**
 * Second-factor / email verification step.
 *
 * Serves both the "confirm your email" and "enter your 2FA code" cases, because
 * from the client's side they are the same interaction: six digits go to the
 * server, the server decides. What the code *means* is the server's business.
 */
export const VerifyCodeForm: FC<VerifyCodeFormProps> = ({
  onSubmit,
  destination,
  onResend,
  canResend = true,
  onBack,
  autoSubmit = true,
  pending = false,
  error = null,
}) => {
  const initialValues = useMemo((): VerifyCodeValues => ({ code: "" }), [])

  const { values, errors, update, handleSubmit } = useAuthForm({
    schema: verifyCodeSchema,
    initialValues,
    onSubmit,
  })

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <AuthError message={error} title="Could not verify that code" />

      {destination ? (
        <p className="text-muted-foreground text-sm">
          We sent a {VERIFICATION_CODE_LENGTH}-digit code to{" "}
          <span className="font-medium">{destination}</span>.
        </p>
      ) : null}

      <CodeInput
        id="verify-code"
        label="Verification code"
        value={values.code}
        onValueChange={(code) => update({ code })}
        onComplete={
          autoSubmit
            ? (code): void => {
                if (!pending) onSubmit({ code })
              }
            : undefined
        }
        error={errors.get("code")}
        disabled={pending}
        focusOnMount
      />

      <AuthSubmitButton pending={pending} pendingLabel="Verifying code">
        Verify
      </AuthSubmitButton>

      <div className="flex items-center justify-between gap-2 text-xs">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            disabled={pending}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 underline-offset-4 hover:underline disabled:opacity-50"
          >
            <ArrowLeft className="size-3" aria-hidden="true" />
            Back
          </button>
        ) : (
          <span />
        )}

        {onResend ? (
          <button
            type="button"
            onClick={onResend}
            disabled={pending || !canResend}
            className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline disabled:opacity-50"
          >
            {canResend ? "Resend code" : "Resend available shortly"}
          </button>
        ) : null}
      </div>
    </form>
  )
}
