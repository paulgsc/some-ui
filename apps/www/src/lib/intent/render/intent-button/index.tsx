/**
 * The one interactive renderer: call sites declare labels instead of writing
 * four-branch matches. Consumes `matchIntent` and holds no lifecycle state.
 *
 * Double-submit protection lives in `useIntent`'s `dispatchingRef`, not
 * here: the race is a render-cycle gap only a synchronous guard at dispatch
 * closes. Disabling while `working` is a visible echo of it.
 *
 * The button is the one control in every state, so a toolbar does not jump
 * as the intent settles: a retryable failure relabels it as its retry rather
 * than adding a second control, word labels share the widest one's width
 * (`SameWidth`), and the failure is said over the screen (`IntentFailure`, a
 * `Notice`), never beside the button (HS1, `tests/ui-fit/intent-failure-fit`).
 * `bare` drops the box around it, for a host that lays it out itself (a
 * wrapping row of actions, a grid cell).
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
import { Button, SameWidth } from "@some-ui/shared"

import { IntentFailure } from "@/lib/intent/render/intent-failure"

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
  /**
   * For a host that lays the button out itself (several actions in one
   * `flex flex-wrap` row, a grid cell): the button is the host's own item,
   * with no box around it.
   */
  bare?: boolean
  /** Passed to every rendered `<Button>`; needed for an icon-only button
   * (`sessions/index.tsx`'s row actions). */
  title?: string
}

const ActionStack = ({
  bare,
  children,
}: PropsWithChildren<{ bare: boolean }>): JSX.Element => (
  <div className={bare ? "contents" : "inline-flex"}>{children}</div>
)

/** What a retryable failure relabels the button. */
const RETRY = "Try again"

/** Every word a button may say, when its labels are words; none otherwise. */
function wordsOf(
  idle: ReactNode,
  ...others: ReadonlyArray<ReactNode>
): ReadonlyArray<string> {
  if (typeof idle !== "string") return []
  return [
    ...new Set([
      idle,
      RETRY,
      ...others.filter((label) => typeof label === "string"),
    ]),
  ]
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
  bare = false,
  title,
}: IntentButtonProps<TStep>): JSX.Element => {
  const every = wordsOf(idleLabel, workingLabel, succeededLabel)
  const say = (shown: ReactNode): ReactNode =>
    every.length === 0 ? (
      shown
    ) : (
      <SameWidth every={every} className="justify-items-center">
        {shown}
      </SameWidth>
    )
  return matchIntent<unknown, JSX.Element, TStep>(state, {
    idle: () => (
      <ActionStack bare={bare}>
        <Button
          variant={variant}
          size={size}
          className={className}
          disabled={disabled}
          onClick={onPress}
          title={title}
        >
          {say(idleLabel)}
        </Button>
      </ActionStack>
    ),
    working: (step) => (
      <ActionStack bare={bare}>
        <Button
          variant={variant}
          size={size}
          className={className}
          disabled
          title={title}
        >
          {say(workingStepLabel?.(step) ?? workingLabel)}
        </Button>
      </ActionStack>
    ),
    succeeded: () => (
      <ActionStack bare={bare}>
        <Button
          variant={variant}
          size={size}
          className={className}
          disabled={disabled}
          onClick={onPress}
          title={title}
        >
          {say(succeededLabel ?? idleLabel)}
        </Button>
      </ActionStack>
    ),
    failed: (error, retry) => {
      const blocked = !error.retryable && error.blocksResubmission === true
      return (
        <ActionStack bare={bare}>
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
            {say(error.retryable ? RETRY : idleLabel)}
          </Button>
          <IntentFailure error={error} />
        </ActionStack>
      )
    },
  })
}
