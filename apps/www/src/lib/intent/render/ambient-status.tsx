/**
 * The ambient renderer: a persistent, low-prominence `role="status"` (a
 * polite live region), not a toast (`presentation.ts`). Working and succeeded
 * render nothing; only `failed` renders, since quiet is not invisible.
 */

import type { JSX } from "react"
import { cn } from "@some-ui/core-utils"
import type { Intent } from "@some-ui/intent-kit"
import { matchIntent } from "@some-ui/intent-kit"

export type AmbientIntentStatusProps<T, TStep extends string = never> = {
  state: Intent<T, TStep>
  className?: string
}

export const AmbientIntentStatus = <T, TStep extends string = never>({
  state,
  className,
}: AmbientIntentStatusProps<T, TStep>): JSX.Element | null =>
  matchIntent<T, JSX.Element | null, TStep>(state, {
    idle: () => null,
    working: () => null,
    succeeded: () => null,
    failed: (error, retry) => (
      <div
        role="status"
        className={cn(
          "text-muted-foreground flex items-center gap-1.5 text-xs",
          className
        )}
      >
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
      </div>
    ),
  })
