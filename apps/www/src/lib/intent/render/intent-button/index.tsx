/**
 * The one interactive renderer: call sites declare labels instead of writing
 * four-branch matches. Consumes `matchIntent` and holds no lifecycle state.
 *
 * Double-submit protection lives in `useIntent`'s `dispatchingRef`, not
 * here: the race is a render-cycle gap only a synchronous guard at dispatch
 * closes. Disabling while `working` is a visible echo of it.
 *
 * The outer action stack is stable across every state, so a toolbar does not
 * jump as the intent settles; a retryable failure replaces the action with
 * its retry rather than adding a second control.
 *
 * A non-retryable failure disables the button only when
 * `error.blocksResubmission` says the previous outcome is unknown (a
 * timed-out non-idempotent `POST`, `errors.ts`'s `fromUnreachable`), where
 * replaying `onPress` could duplicate a write. Otherwise (e.g. a 4xx
 * validation error) it falls back to `onPress`, so the person can fix their
 * input and resubmit.
 */

import type { JSX, PropsWithChildren, ReactNode } from "react"
import { cn } from "@some-ui/core-utils"
import type { Intent } from "@some-ui/intent-kit"
import { matchIntent } from "@some-ui/intent-kit"
import type { ButtonProps } from "@some-ui/shared"
import { Button } from "@some-ui/shared"

import { IntentFailure } from "@/lib/intent/render"

export type IntentButtonProps<TStep extends string = never> = {
  state: Intent<unknown, TStep>
  onPress: () => void
  idleLabel: ReactNode
  workingLabel: ReactNode
  /** For a composite intent's `working` step (e.g. "Saving...",
   * "Starting..."). Falls back to `workingLabel` for an unmapped step. */
  workingStepLabel?: (step: TStep | undefined) => ReactNode | undefined
  /** Shown instead of `idleLabel` after success. Rarely needed: a toast or
   * navigation usually confirms. */
  succeededLabel?: ReactNode
  variant?: ButtonProps["variant"]
  size?: ButtonProps["size"]
  className?: string
  /** Composed with the intent's own working-state disable, e.g. a
   * caller's `!isDirty` or a validation failure. */
  disabled?: boolean
  failureClassName?: string
  /** Passed to every rendered `<Button>`; needed for an icon-only button
   * (`sessions/index.tsx`'s row actions). */
  title?: string
}

const ActionStack = ({ children }: PropsWithChildren): JSX.Element => (
  <div className="inline-flex flex-col items-start gap-2">{children}</div>
)

export const IntentButton = <TStep extends string = never>({
  state,
  onPress,
  idleLabel,
  workingLabel,
  workingStepLabel,
  succeededLabel,
  variant,
  size,
  className,
  disabled = false,
  failureClassName,
  title,
}: IntentButtonProps<TStep>): JSX.Element =>
  matchIntent<unknown, JSX.Element, TStep>(state, {
    idle: () => (
      <ActionStack>
        <Button
          variant={variant}
          size={size}
          className={className}
          disabled={disabled}
          onClick={onPress}
          title={title}
        >
          {idleLabel}
        </Button>
      </ActionStack>
    ),
    working: (step) => (
      <ActionStack>
        <Button
          variant={variant}
          size={size}
          className={className}
          disabled
          title={title}
        >
          {workingStepLabel?.(step) ?? workingLabel}
        </Button>
      </ActionStack>
    ),
    succeeded: () => (
      <ActionStack>
        <Button
          variant={variant}
          size={size}
          className={className}
          disabled={disabled}
          onClick={onPress}
          title={title}
        >
          {succeededLabel ?? idleLabel}
        </Button>
      </ActionStack>
    ),
    failed: (error, retry) => {
      const blocked = !error.retryable && error.blocksResubmission === true
      return (
        <ActionStack>
          <div className="flex flex-col items-end gap-1.5 pe-1.5">
            <Button
              variant={variant}
              size={size}
              className={cn(
                className,
                "opacity-80 hover:opacity-100 transition-opacity",
                // Custom striped CSS gradient layered over the existing background
                "bg-[linear-gradient(135deg,rgba(0,0,0,0.15)_25%,transparent_25%,transparent_50%,rgba(0,0,0,0.15)_50%,rgba(0,0,0,0.15)_75%,transparent_75%,transparent)]",
                "bg-[size:1rem_1rem]" // Adjust tile size for tighter/wider stripes
              )}
              disabled={disabled || blocked}
              onClick={error.retryable ? retry : blocked ? undefined : onPress}
              title={title}
            >
              {error.retryable ? "Try again" : idleLabel}
            </Button>
            <IntentFailure
              error={error}
              className={cn("w-full", failureClassName)}
            />
          </div>
        </ActionStack>
      )
    },
  })
