import type { FC } from "react"
import { useState } from "react"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionOption } from "@leetype/lib/leetype/round-probe"
import type { Commitment } from "@leetype/types/commitment"
import { cn } from "@some-ui/core-utils"
import { Check, CircleHelp, X } from "lucide-react"

/** A→B→C→D. Beyond the fourth option a card is a quiz page, not a card. */
const BADGES = ["A", "B", "C", "D", "E"] as const

const ABSTAIN_LABEL = "Not sure"

type RoundChoicesProps = {
  /** The forcing question. Read at full size — never a caption. */
  prompt: string
  options: ReadonlyArray<PropositionOption>
  /** μ(d) for the diff this card was posed for (Thm. 6.1); never painted before a commitment. */
  answerId: PropositionId
  /**
   * Fires once, synchronously, on tap, before the verdict paints (as
   * `CommitmentControl`'s, Ax. 9.2).
   */
  onCommit: (commitment: Commitment) => void
  className?: string
}

/**
 * The round-shaped counterpart to `ClaimChoices`. Where `ClaimChoices`
 * records a choice a later submission resolves, a round has no second step
 * (Def. 9.1: "a single, cheap, mandatory-before-reveal action"), so each row
 * is a button that commits and reveals on tap, like `CommitmentControl`,
 * with the verdict landing on the rows as a glyph plus a word.
 *
 * # No option is colored before a commitment
 *
 * This component owns the commit gesture, so it holds `answerId` from mount,
 * but paint reads `revealedAnswerId`, derived from `committed` (initially
 * `null`). No render holds the verdict and merely hides it.
 *
 * # Abstention is a real row
 *
 * Same size and weight as every option (Def. 9.1: "never a lesser option").
 * It commits `{ kind: "abstain" }` and reveals exactly what an answer would:
 * abstention withholds a claim, not the reveal.
 */
export const RoundChoices: FC<RoundChoicesProps> = ({
  prompt,
  options,
  answerId,
  onCommit,
  className,
}) => {
  const [committed, setCommitted] = useState<Commitment | null>(null)

  const commit = (commitment: Commitment): void => {
    // One-shot (Def. 9.1): every button is disabled once committed.
    if (committed !== null) return
    onCommit(commitment)
    setCommitted(commitment)
  }

  // Derived, never the raw prop: unpainted until a commitment lands.
  const revealedAnswerId = committed !== null ? answerId : null
  const pickedId = committed?.kind === "choice" ? committed.id : null
  const abstained = committed?.kind === "abstain"

  return (
    <fieldset className={cn("min-w-0 border-0 p-0", className)}>
      <legend className="mb-3 text-pretty text-base font-medium text-foreground">
        {prompt}
      </legend>

      <div className="flex flex-col gap-2">
        {options.map((option, index) => {
          const isAnswer = option.id === revealedAnswerId
          const isPicked = option.id === pickedId
          // After a commitment only the answer and the pick say anything,
          // matching `ClaimChoices`' resolution states.
          const resolution =
            revealedAnswerId === null
              ? "open"
              : isAnswer
                ? "correct"
                : isPicked
                  ? "missed"
                  : "quiet"

          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isPicked}
              disabled={committed !== null}
              onClick={() => commit({ kind: "choice", id: option.id })}
              className={cn(
                "group relative flex min-h-11 w-full items-start gap-3 rounded-lg py-2.5 pl-3 pr-3 text-left transition-colors duration-150",
                "border-l-2 bg-card/40",
                resolution === "open" &&
                  "border-l-border/40 text-muted-foreground hover:bg-card/70",
                resolution === "correct" &&
                  "border-l-emerald-500 bg-emerald-500/[0.07] text-foreground",
                resolution === "missed" &&
                  "border-l-rose-500 bg-rose-500/[0.06] text-foreground",
                resolution === "quiet" &&
                  "border-l-border/30 text-muted-foreground/60",
                committed !== null && "cursor-default"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mt-px flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums",
                  resolution === "open" &&
                    "border-border/60 text-muted-foreground/70",
                  resolution === "correct" &&
                    "border-emerald-500 text-emerald-400",
                  resolution === "missed" && "border-rose-500 text-rose-400",
                  resolution === "quiet" &&
                    "border-border/60 text-muted-foreground/70",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                )}
              >
                {BADGES[index] ?? index + 1}
              </span>

              <span className="min-w-0 flex-1 text-pretty text-sm leading-snug">
                {option.text}
              </span>

              {resolution === "correct" && (
                <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-400">
                  <Check className="size-3.5" aria-hidden="true" />
                  Correct
                </span>
              )}
              {resolution === "missed" && (
                <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-rose-400">
                  <X className="size-3.5" aria-hidden="true" />
                  Not this one
                </span>
              )}
            </button>
          )
        })}

        <button
          type="button"
          aria-pressed={abstained}
          disabled={committed !== null}
          onClick={() => commit({ kind: "abstain" })}
          className={cn(
            "group relative flex min-h-11 w-full items-center gap-3 rounded-lg py-2.5 pl-3 pr-3 text-left transition-colors duration-150",
            "border-l-2 bg-card/40",
            committed === null &&
              "border-l-border/40 text-muted-foreground hover:bg-card/70",
            abstained && "border-l-primary bg-primary/10 text-foreground",
            committed !== null &&
              !abstained &&
              "border-l-border/30 text-muted-foreground/60",
            committed !== null && "cursor-default"
          )}
        >
          <span
            aria-hidden="true"
            className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground/70"
          >
            <CircleHelp className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1 text-pretty text-sm leading-snug">
            {ABSTAIN_LABEL}
          </span>
          {abstained && (
            <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
              Recorded
            </span>
          )}
        </button>
      </div>
    </fieldset>
  )
}
