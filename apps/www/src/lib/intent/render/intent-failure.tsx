/**
 * The interactive failure affordance every `IntentButton` renders on
 * `failed` — shared so #936's nine files render one failure shape rather
 * than nine invented ones.
 *
 * `Alert`'s own implementation sets `role="alert"` unconditionally (see
 * `packages/ui/shared/src/components/ui/alert.tsx`), which is what makes
 * this announced to assistive technology for free - #945's own acceptance
 * criterion, satisfied by reusing the primitive rather than adding one.
 *
 * No retry control when `!error.retryable` (`FileHostNotConfiguredError` →
 * `unavailable`, most namely): a retry button wired to a request that
 * cannot succeed is the inert-button defect in a new costume, and #945's
 * issue names this exact failure mode.
 */

import type { JSX } from "react"
import type { IntentError } from "@some-ui/intent-kit"
import { Alert, AlertDescription, Button } from "@some-ui/shared"
import { cn } from "some-ui-utils"

export type IntentFailureProps = {
  error: IntentError
  onRetry: () => void
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
      {error.retryable ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </AlertDescription>
  </Alert>
)
