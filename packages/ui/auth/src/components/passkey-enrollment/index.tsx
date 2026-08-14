import type { FC } from "react"
import { Button } from "@some-ui/shared"
import { Fingerprint, ShieldCheck } from "lucide-react"

import type { AuthFormStatusProps } from "../../types/auth"
import { AuthError } from "../auth-error"
import { PasskeyButton } from "../passkey-button"

export type PasskeyEnrollmentProps = AuthFormStatusProps & {
  onCreate?: () => void
  onSkip?: () => void
}

/** Static enrollment prompt; WebAuthn options and credential exchange stay in the adapter. */
export const PasskeyEnrollment: FC<PasskeyEnrollmentProps> = ({
  onCreate,
  onSkip,
  pending = false,
  error = null,
}) => (
  <div className="space-y-5">
    <div className="bg-muted flex size-12 items-center justify-center rounded-full">
      <Fingerprint className="size-6" aria-hidden="true" />
    </div>
    <div className="space-y-2">
      <p className="font-medium">Sign in faster and more securely</p>
      <p className="text-muted-foreground text-sm">
        A passkey uses your face, fingerprint, or device PIN. It cannot be
        guessed or reused on a lookalike website.
      </p>
      <p className="text-muted-foreground flex gap-2 text-xs">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Your biometric data stays on your device.
      </p>
    </div>
    <AuthError message={error} title="Could not create passkey" />
    <PasskeyButton
      onClick={onCreate ?? noop}
      disabled={!onCreate}
      pending={pending}
      label="Create a passkey"
    />
    {onSkip ? (
      <Button
        type="button"
        variant="ghost"
        onClick={onSkip}
        disabled={pending}
        className="w-full"
      >
        Not now
      </Button>
    ) : null}
  </div>
)

const noop = (): void => undefined
