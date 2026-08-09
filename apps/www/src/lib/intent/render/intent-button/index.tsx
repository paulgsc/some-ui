/**
 * #945/S1: the one interactive renderer #936's nine files migrate onto,
 * so seventeen call sites become declarative instead of seventeen
 * hand-written four-branch matches. Consumes `matchIntent` internally and
 * holds no lifecycle state of its own - everything it renders comes from
 * the `Intent` it is handed.
 *
 * Double-submit protection does **not** live here: it lives in
 * `useIntent`'s `dispatchingRef` guard (see that module's header), because
 * the race it closes is a render-cycle timing gap, not a rendering
 * concern - a synchronous ref guard at the dispatch site is the only place
 * that actually closes it. `IntentButton` disabling itself while `working`
 * is a visible echo of that guard, not the mechanism.
 *
 * The outer action stack is deliberately stable across every state. Earlier
 * versions introduced it only for failures, changing the button's flex item
 * between a button and a div as the intent settled. In toolbars that caused a
 * visible horizontal jump. A retryable failure also replaces the original
 * action with its retry rather than rendering two controls that dispatch the
 * same intent.
 */

import type { JSX, PropsWithChildren, ReactNode } from "react"
import type { Intent } from "@some-ui/intent-kit"
import { matchIntent } from "@some-ui/intent-kit"
import type { ButtonProps } from "@some-ui/shared"
import { Button } from "@some-ui/shared"
import { cn } from "some-ui-utils"

import { IntentFailure } from "@/lib/intent/render"

export type IntentButtonProps<TStep extends string = never> = {
  state: Intent<unknown, TStep>
  onPress: () => void
  idleLabel: ReactNode
  workingLabel: ReactNode
  /** For a composite intent's `working` step - e.g. "Saving..." while
   * creating, "Starting..." while activating. Falls back to `workingLabel`
   * for any step (or no step) left unmapped. */
  workingStepLabel?: (step: TStep | undefined) => ReactNode | undefined
  /** Shown instead of `idleLabel` immediately after success. Most call
   * sites don't need this - a toast or a navigation is today's actual
   * confirmation, lifted verbatim, and the button reverting to its idle
   * label the moment it re-enables (or disabling via `disabled` when the
   * caller's own dirty-check says there's nothing new to save) is already
   * correct. */
  succeededLabel?: ReactNode
  variant?: ButtonProps["variant"]
  size?: ButtonProps["size"]
  className?: string
  /** Composed with the intent's own working-state disable, e.g. a
   * caller's `!isDirty` or a validation failure. */
  disabled?: boolean
  failureClassName?: string
  /** Passed through to every rendered `<Button>` verbatim. Only needed for
   * an icon-only button (no visible `idleLabel` text) - see
   * `sessions/index.tsx`'s duplicate/delete row actions. */
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
    failed: (error, retry) => (
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
            disabled={disabled}
            onClick={error.retryable ? retry : onPress}
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
    ),
  })
