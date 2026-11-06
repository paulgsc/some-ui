/**
 * The interactive failure affordance: said over the screen (`Notice`, role
 * `alert`, so it is announced), never in its layout (HS1). It holds its own
 * retry, except when `!error.retryable` (e.g. `unavailable`): a retry that
 * cannot succeed is an inert button. Closed, it stays closed until another
 * failure.
 */

import type { JSX } from "react"
import { useState } from "react"
import type { IntentError } from "@some-ui/intent-kit"
import { Button, Notice } from "@some-ui/shared"

export type IntentFailureProps = {
  error: IntentError
  onRetry?: () => void
}

export const IntentFailure = ({
  error,
  onRetry,
}: IntentFailureProps): JSX.Element | null => {
  const [dismissed, setDismissed] = useState<IntentError | null>(null)
  if (dismissed === error) return null
  return (
    <Notice role="alert" tone="danger" onDismiss={() => setDismissed(error)}>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span>{error.summary}</span>
        {error.retryable && onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </span>
    </Notice>
  )
}
