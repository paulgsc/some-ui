import type { FC } from "react"
import { cn } from "some-ui-utils"

type ReadingFeedbackProps = {
  /**
   * The author's reason for the claim — `rationale.whyRepairDiscriminates`,
   * written to answer *why this repair and not a shorter one that only
   * silences the symptom*.
   */
  justification: string
  className?: string
}

/**
 * The explanation panel (LTY-MOBILE): why the claim the player just picked
 * out is the one the change makes.
 *
 * # It carries no verdict, because the verdict is already where it belongs
 *
 * `ClaimChoices` marks the answer and the missed pick on the rows themselves,
 * with a glyph and a word, which is where the learner's eye already is — the
 * option they chose. Repeating "Correct" here would be the same fact said
 * twice in two registers, and it would leave this panel reading as a score
 * card rather than as the thing actually worth reading. So the panel is
 * neutral paint and one eyebrow, and the sentence underneath is its whole
 * content.
 *
 * That is also what keeps it honest: "Correct" on its own teaches nothing,
 * and a learner who guessed right learns exactly as much as one who reasoned.
 *
 * # Why nothing renders without an authored reason
 *
 * The sentence is the corpus's, not this component's. Diagnostic steps have
 * carried `rationale.whyRepairDiscriminates` since LTY-FAMILIES; construction
 * steps have no equivalent field, so their cards end at the marked rows and
 * this panel does not mount. That is a real thinness on half the corpus, and
 * it is deliberately left visible rather than papered over with generated
 * prose or with the claim restated in different words — the fix is an
 * authored sentence for the construction family, which is a corpus change
 * argued on its own merits, not something this component should fake.
 */
export const ReadingFeedback: FC<ReadingFeedbackProps> = ({
  justification,
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
    </div>
  )
}
