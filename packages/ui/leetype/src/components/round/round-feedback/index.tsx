import type { FC } from "react"
import { cn } from "@some-ui/core-utils"

type RoundFeedbackProps = {
  /** μ(d)'s register statement: canon §7's general claim. */
  justification: string
  /** Why *this* diff instantiates the claim (`DiffSetMember.propositionGloss`); may be absent. */
  gloss?: string
  className?: string
}

/**
 * A round's explanation. No verdict: the rows already carry it, so this is
 * neutral paint and one eyebrow.
 *
 * `justification` always renders; `gloss`, when authored, renders beneath
 * it, never instead. A missing gloss reads thin on purpose; the fix is an
 * authored gloss, not generated prose.
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
