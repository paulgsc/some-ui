/**
 * The interactive failure affordance: a `Notice` in `alert`, so it is
 * announced. It holds its own retry, except when `!error.retryable` (e.g.
 * `unavailable`): a retry that cannot succeed is an inert button.
 */

import type { JSX } from "react"
import type { IntentError } from "@some-ui/intent-kit"
import { Notice } from "@some-ui/shared"

export type IntentFailureProps = {
  error: IntentError
  onRetry?: () => void
}

export const IntentFailure = ({
  error,
  onRetry,
}: IntentFailureProps): JSX.Element => (
  <Notice
    key={error.summary}
    tone="danger"
    dismissible
    action={
      error.retryable && onRetry
        ? { label: "Try again", onClick: onRetry }
        : undefined
    }
  >
    {error.summary}
  </Notice>
)
