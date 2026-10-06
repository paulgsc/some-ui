/**
 * The interactive failure affordance every `IntentButton` renders on
 * `failed`. `Alert` sets `role="alert"`, so it is announced for free. No
 * retry control when `!error.retryable` (e.g. `unavailable`): a retry that
 * cannot succeed is an inert button.
 */

import type { JSX } from "react"
import { cn } from "@some-ui/core-utils"
import type { IntentError } from "@some-ui/intent-kit"
import { Alert, AlertDescription, Button } from "@some-ui/shared"

export type IntentFailureProps = {
  error: IntentError
  onRetry?: () => void
  className?: string
}

export const IntentFailure = ({
  error,
  onRetry,
  className,
}: IntentFailureProps): JSX.Element => (
  <Alert variant="destructive" className={cn("py-2", className)}>
    <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
      <span>{error.summary}</span>
      {error.retryable && onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </AlertDescription>
  </Alert>
)
