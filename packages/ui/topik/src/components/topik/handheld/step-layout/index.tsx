import type { JSX, ReactNode } from "react"
import { cn } from "some-ui-utils"

type StepLayoutProps = {
  /** What the step is about: the line, the question, the recap. */
  stage: ReactNode
  /** What the thumb does: every control lives here, never in the stage. */
  dock: ReactNode
  /** A phone on its side: stage and dock side by side instead of stacked. */
  short: boolean
  /** Stage scrolls (a recap, an explanation) rather than centring. */
  longForm?: boolean
}

/**
 * The one layout every handheld step shares.
 *
 * Portrait puts the controls in the bottom third, where a thumb reaches
 * one-handed; landscape moves them to a right-hand column, since 390px of
 * height cannot hold a stage above a dock. The stage is the only region that
 * may scroll, and only when it says its content is long-form.
 */
export const StepLayout = ({
  stage,
  dock,
  short,
  longForm = false,
}: StepLayoutProps): JSX.Element => (
  <div
    className={cn(
      "flex min-h-0 flex-1",
      short ? "flex-row gap-3 px-3 pb-3" : "flex-col"
    )}
  >
    <div
      data-scroll-intent={longForm ? "long-form" : undefined}
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col",
        longForm
          ? // scroll-intent: long-form — a recap or an explanation is as long
            // as its author wrote it; only steps that declare so may scroll.
            "overflow-y-auto overscroll-contain"
          : "items-center justify-center overflow-hidden",
        short ? "py-2" : "px-5 py-4"
      )}
    >
      {stage}
    </div>
    <div
      className={cn(
        "flex shrink-0 flex-col justify-end gap-2",
        short
          ? "w-64 py-2"
          : "border-border/60 border-t px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
      )}
    >
      {dock}
    </div>
  </div>
)
