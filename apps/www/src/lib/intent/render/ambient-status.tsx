/**
 * The ambient renderer: a low-prominence status said over the screen
 * (`Notice`, role `status`, a polite live region), never in its layout
 * (HS1). Working and succeeded render nothing; only `failed` renders, since
 * quiet is not invisible. Closed, it stays closed until another failure.
 */

import type { JSX } from "react"
import { useState } from "react"
import type { Intent, IntentError } from "@some-ui/intent-kit"
import { matchIntent } from "@some-ui/intent-kit"
import { Notice } from "@some-ui/shared"

export type AmbientIntentStatusProps<T, TStep extends string = never> = {
  state: Intent<T, TStep>
}

export const AmbientIntentStatus = <T, TStep extends string = never>({
  state,
}: AmbientIntentStatusProps<T, TStep>): JSX.Element | null => {
  const [dismissed, setDismissed] = useState<IntentError | null>(null)
  return matchIntent<T, JSX.Element | null, TStep>(state, {
    idle: () => null,
    working: () => null,
    succeeded: () => null,
    failed: (error, retry) =>
      error === dismissed ? null : (
        <Notice role="status" onDismiss={() => setDismissed(error)}>
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <span aria-hidden="true" className="text-destructive">
              ●
            </span>
            <span>{error.summary}</span>
            {error.retryable ? (
              <button
                type="button"
                onClick={retry}
                className="text-foreground underline underline-offset-2"
              >
                Retry
              </button>
            ) : null}
          </span>
        </Notice>
      ),
  })
}
