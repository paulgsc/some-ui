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
 */

import type { JSX, ReactNode } from "react"
import type { Intent } from "@some-ui/intent-kit"
import { matchIntent } from "@some-ui/intent-kit"
import type { ButtonProps } from "@some-ui/shared"
import { Button } from "@some-ui/shared"
import { cn } from "some-ui-utils"

import { IntentFailure } from "./intent-failure"

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
    ),
    working: (step) => (
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled
        title={title}
      >
        {workingStepLabel?.(step) ?? workingLabel}
      </Button>
    ),
    succeeded: () => (
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
    ),
    failed: (error, retry) => (
      <div className="flex flex-col items-start gap-2">
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
        <IntentFailure
          error={error}
          onRetry={retry}
          className={cn("w-full", failureClassName)}
        />
      </div>
    ),
  })
