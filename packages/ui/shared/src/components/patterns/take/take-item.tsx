import type { JSX, ReactNode } from "react"
import type {
  PatternTake,
  TakeItemView,
  TakePlace,
  TakeWords,
} from "@some-ui/voice-capture"
import { TAKE_WORDS, takeSaid } from "@some-ui/voice-capture"

import { cn } from "../../../lib/utils"
import type { TakeButtonProps } from "./take-button"
import { TakeButton } from "./take-button"
import { TakeRow } from "./take-row"

export type TakeItemProps = {
  /** What the parts show for the item: `takeItemView(...)`. */
  view: TakeItemView
  /** D1: the button's tap, which starts a take or stops the one under way. */
  onTap: () => void
  /** Plays a take, or stops it while it plays. */
  onPlay: (id: string) => void
  /** Records a current take again (D2). */
  onRedo: (id: string) => void
  /** Sets a current take aside (D3); `place` is where it is kept. */
  onLetGo: (id: string, place: TakePlace) => void
  /** What the item is, for a screen reader. */
  label?: string
  /** The screen's words about one take, under its length. */
  describe?: (take: PatternTake) => ReactNode
  /**
   * The line beside the button, where a screen's store says more than the
   * pattern's table can (its way to make room when full): `TAKE_WORDS`,
   * spread, unless given.
   */
  words?: TakeWords
  className?: string
} & Pick<TakeButtonProps, "size">

/**
 * One item's takes, from its view: the take button with its one line beside
 * it (how the last take ended, a take set aside, a take that couldn't play),
 * then the item's current takes, then the earlier ones a Redo superseded,
 * collapsed (D2). It renders `view` and forwards what is tapped, so a screen
 * whose own machine stands between a tap and the pattern (Rust Rounds' card,
 * LeetType's answer) uses the same parts as `TakeList`, which wires them to
 * the pattern directly.
 */
export const TakeItem = ({
  view,
  onTap,
  onPlay,
  onRedo,
  onLetGo,
  label,
  describe,
  words = TAKE_WORDS,
  size,
  className,
}: TakeItemProps): JSX.Element => {
  const { said } = view
  return (
    <section
      aria-label={label}
      className={cn("flex flex-col gap-3", className)}
    >
      <div className="flex flex-col items-center gap-2">
        <TakeButton view={view.button} size={size} onTap={onTap} />
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
              onPlay={() => onPlay(row.take.id)}
              onRedo={() => onRedo(row.take.id)}
              onLetGo={() => onLetGo(row.take.id, row.take.kept.place)}
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
                onPlay={() => onPlay(row.take.id)}
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
