/**
 * #945/#944: the ambient renderer — a persistent, low-prominence status
 * affordance rather than a `sonner` toast, per `presentation.ts`'s own
 * documented reasoning (a toast for something nobody asked for is a toast
 * they can miss with no way to check later). `role="status"` is an
 * implicit polite live region: present in the DOM whether or not anyone is
 * looking, and read out if a screen reader happens to be active when it
 * appears - the ambient equivalent of `IntentFailure`'s `role="alert"`.
 *
 * Working and succeeded render nothing, per policy - ambient means quiet
 * progress. Only `failed` renders, because ambient's whole point is that
 * *quiet* and *invisible* are different things (`failureMayBeSilent` is
 * `false` for every mode - see `presentation.ts`).
 */

import type { JSX } from "react"
import type { Intent } from "@some-ui/intent-kit"
import { matchIntent } from "@some-ui/intent-kit"
import { cn } from "some-ui-utils"

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
