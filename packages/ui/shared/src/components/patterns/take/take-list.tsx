import type { JSX, ReactNode } from "react"
import type { PatternTake, TakePattern } from "@some-ui/voice-capture"
import { TAKE_WORDS, takeItemView, takeSaid } from "@some-ui/voice-capture"

import { cn } from "../../../lib/utils"
import type { TakeButtonProps } from "./take-button"
import { TakeButton } from "./take-button"
import { TakeRow } from "./take-row"
import { useTakePattern } from "./use-take-pattern"

export type TakeListProps = {
  /**
   * The screen's take pattern: one runtime per screen, which the screen
   * makes over its own store and lets go of when it goes (`leave`).
   */
  pattern: TakePattern
  /** The item these takes answer: what each take is recorded for. */
  answers: string
  /** The screen's takes, as its store holds them; other items' are ignored. */
  takes: ReadonlyArray<PatternTake>
  /** What the item is, for a screen reader. */
  label?: string
  /** The screen's words about one take, under its length. */
  describe?: (take: PatternTake) => ReactNode
  className?: string
} & Pick<TakeButtonProps, "size">

/**
 * One item's takes, as the take pattern shows them (MIC2, #2372): the take
 * button with its one line beside it (how the last take ended, a take set
 * aside, a take that couldn't play), then the item's current takes, then
 * the earlier ones a Redo superseded, collapsed (D2). It renders
 * `takeItemView` over the pattern's snapshot and dispatches the pattern's
 * intents: what a tap means, and which late answer counts, is the
 * pattern's (`@some-ui/voice-capture`, `takePattern`).
 */
export const TakeList = ({
  pattern,
  answers,
  takes,
  label,
  describe,
  size,
  className,
}: TakeListProps): JSX.Element => {
  const words = TAKE_WORDS
  const snapshot = useTakePattern(pattern)
  const view = takeItemView(snapshot, takes, answers, pattern.options)
  const { said } = view
  return (
    <section
      aria-label={label}
      className={cn("flex flex-col gap-3", className)}
    >
      <div className="flex flex-col items-center gap-2">
        <TakeButton
          view={view.button}
          size={size}
          onTap={() => pattern.tap(answers, view.supersedes)}
        />
        <p
          aria-live="polite"
          data-take-ended={said?.kind === "ended" ? said.ended.seq : undefined}
          className="text-muted-foreground min-h-5 text-center text-sm"
        >
          {said === null ? null : takeSaid(words, said)}
        </p>
      </div>
      {view.current.length > 0 && (
        <ul className="space-y-2">
          {view.current.map((row) => (
            <TakeRow
              key={row.take.id}
              row={row}
              onPlay={() => pattern.play(row.take.id)}
              onRedo={() => pattern.tap(answers, row.take.id)}
              onLetGo={() => pattern.letGo(row.take.id, row.take.place)}
            >
              {describe?.(row.take)}
            </TakeRow>
          ))}
        </ul>
      )}
      {view.earlier.length > 0 && (
        <details className="group">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">
            {words.earlier(view.earlier.length)}
          </summary>
          <ul className="mt-2 space-y-2">
            {view.earlier.map((row) => (
              <TakeRow
                key={row.take.id}
                row={row}
                onPlay={() => pattern.play(row.take.id)}
              >
                {describe?.(row.take)}
              </TakeRow>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
