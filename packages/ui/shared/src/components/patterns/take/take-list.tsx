import type { JSX } from "react"
import type { PatternTake, TakePattern } from "@some-ui/voice-capture"
import { takeItemView } from "@some-ui/voice-capture"

import type { TakeItemProps } from "./take-item"
import { TakeItem } from "./take-item"
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
} & Pick<TakeItemProps, "label" | "describe" | "size" | "className">

/**
 * One item's takes, as the take pattern shows them (`TakeItem`), over the
 * pattern's snapshot: it renders `takeItemView` and dispatches the pattern's
 * intents. What a tap means, and which late answer counts, is the
 * pattern's (`@some-ui/voice-capture`, `takePattern`).
 */
export const TakeList = ({
  pattern,
  answers,
  takes,
  ...item
}: TakeListProps): JSX.Element => {
  const snapshot = useTakePattern(pattern)
  const view = takeItemView(snapshot, takes, answers, pattern.options)
  return (
    <TakeItem
      {...item}
      view={view}
      onTap={() => pattern.tap(answers, view.supersedes)}
      onPlay={pattern.play}
      onRedo={(id) => pattern.tap(answers, id)}
      onLetGo={pattern.letGo}
    />
  )
}
