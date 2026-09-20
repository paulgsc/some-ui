import type { FC } from "react"
import { cn } from "some-ui-utils"

type RoundFeedbackProps = {
  /** μ(d)'s own register statement (`#1330`) — canon §7's authored claim, general by construction. */
  justification: string
  /**
   * The round-specific gloss (`DiffSetMember.propositionGloss`,
   * `types/round.ts`) — why *this* diff instantiates `justification`'s
   * general claim. Absent on a diff-set member with no gloss authored
   * yet, which is left visible as a real thinness rather than papered
   * over (see this component's own doc comment).
   */
  gloss?: string
  className?: string
}

/**
 * The round-shaped counterpart to `components/reading-game`'s
 * `ReadingFeedback` (B3, #1220) — additive, new component, not a rewrite
 * of it, the same posture `RoundChoices` already takes on `ClaimChoices`.
 *
 * # It carries no verdict, because the verdict is already where it belongs
 *
 * `RoundChoices` marks the answer and the missed pick on the rows
 * themselves, with a glyph and a word — repeating "Correct" here would be
 * the same fact said twice in two registers. So this panel is neutral
 * paint and one eyebrow, exactly `ReadingFeedback`'s own restraint.
 *
 * # Two paragraphs, never one instead of the other
 *
 * `justification` (canon §7's own statement) always renders — every
 * active register entry has one by construction (`#1330`). `gloss`, when
 * authored, renders *beneath* it, never instead of it (#1220's own
 * acceptance criterion): the general claim is the thing being taught, and
 * the gloss is the instance. A round whose gloss is missing reads thin on
 * purpose — the fix is an authored gloss, a corpus change argued on its
 * own merits, not generated prose standing in for one.
 */
export const RoundFeedback: FC<RoundFeedbackProps> = ({
  justification,
  gloss,
  className,
}) => {
  return (
    <div
      className={cn(
        "rounded-lg border-l-2 border-l-border bg-card/50 px-3 py-3",
        className
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        Why
      </p>
      <p className="mt-1.5 text-pretty text-sm leading-relaxed text-muted-foreground">
        {justification}
      </p>
      {gloss !== undefined && (
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          {gloss}
        </p>
      )}
    </div>
  )
}
