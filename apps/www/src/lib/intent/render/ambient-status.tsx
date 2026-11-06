/**
 * The ambient renderer: a low-prominence status in a `Notice` (role
 * `status`, a polite live region). Working and succeeded render nothing;
 * only `failed` renders, since quiet is not invisible.
 */

import type { JSX } from "react"
import type { Intent } from "@some-ui/intent-kit"
import { matchIntent } from "@some-ui/intent-kit"
import { Notice } from "@some-ui/shared"

export type AmbientIntentStatusProps<T, TStep extends string = never> = {
  state: Intent<T, TStep>
}

export const AmbientIntentStatus = <T, TStep extends string = never>({
  state,
}: AmbientIntentStatusProps<T, TStep>): JSX.Element | null =>
  matchIntent<T, JSX.Element | null, TStep>(state, {
    idle: () => null,
    working: () => null,
    succeeded: () => null,
    failed: (error, retry) => (
      <Notice
        key={error.summary}
        dismissible
        action={
          error.retryable ? { label: "Retry", onClick: retry } : undefined
        }
      >
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <span aria-hidden="true" className="text-destructive">
            ●
          </span>
          <span>{error.summary}</span>
        </span>
      </Notice>
    ),
  })
