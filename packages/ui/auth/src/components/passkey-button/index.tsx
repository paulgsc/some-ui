import type { FC } from "react"
import { cn } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import { Fingerprint, LoaderCircle } from "lucide-react"

export type PasskeyButtonProps = {
  onClick: () => void
  pending?: boolean
  disabled?: boolean
  label?: string
  className?: string
}

/**
 * A transport-free passkey action. The consumer performs the WebAuthn
 * ceremony (or delegates it to its auth SDK) from `onClick`.
 */
export const PasskeyButton: FC<PasskeyButtonProps> = ({
  onClick,
  pending = false,
  disabled = false,
  label = "Continue with a passkey",
  className,
}) => (
  <Button
    type="button"
    variant="outline"
    onClick={onClick}
    disabled={disabled || pending}
    aria-busy={pending}
    className={cn("w-full", className)}
  >
    {pending ? (
      <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden="true" />
    ) : (
      <Fingerprint className="mr-2 size-4" aria-hidden="true" />
    )}
    {label}
  </Button>
)
