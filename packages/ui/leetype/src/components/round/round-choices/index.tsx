import type { FC } from "react"
import { useState } from "react"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionOption } from "@leetype/lib/leetype/round-probe"
import type { Commitment } from "@leetype/types/commitment"
import { Check, CircleHelp, X } from "lucide-react"
import { cn } from "some-ui-utils"

/** A→B→C→D. Beyond the fourth option a card is a quiz page, not a card. */
const BADGES = ["A", "B", "C", "D", "E"] as const

const ABSTAIN_LABEL = "Not sure"

type RoundChoicesProps = {
  /** The forcing question. Read at full size — never a caption. */
  prompt: string
  options: ReadonlyArray<PropositionOption>
  /** μ(d) for the diff this card was posed for (Thm. 6.1) — never read for rendering until a commitment lands (see this component's own doc comment). */
  answerId: PropositionId
  /**
   * Fires exactly once, synchronously, the instant a row is tapped —
   * before this component's own re-render paints the verdict. Same
   * ordering guarantee `CommitmentControl`'s own `onCommit` makes, and for
   * the same reason (Ax. 9.2): once the verdict is visible no later
   * response carries information about the learner's prior state.
   */
  onCommit: (commitment: Commitment) => void
  className?: string
}

/**
 * The round-shaped counterpart to `components/reading-game`'s
 * `ClaimChoices` (B3, #1220) — additive, new component, not a rewrite of
 * it, the same posture `lib/leetype/round-probe` already took on
 * `lib/leetype/reading-probe` (B2, #1219). `ClaimChoices` is select-then-
 * resolve: picking a row records a choice a *separate* submission
 * elsewhere later resolves. A round has no such second step — Def. 9.1
 * calls a commitment "a single, cheap, mandatory-before-reveal action,"
 * and Ax. 9.1 requires the closed set always include an explicit
 * abstention — so each row here is a plain button that commits and
 * reveals on tap, the same interaction `CommitmentControl` (C3, #1215)
 * already established, applied to option rows instead of a button grid so
 * the verdict can land "on the option rows, as a glyph plus a word, next
 * to the option actually chosen" (#1220's own restraint, inherited from
 * LTY-MOBILE).
 *
 * # No option is ever colored before a commitment is recorded
 *
 * `answerId` is a required prop — this component, unlike `ClaimChoices`,
 * owns the commit gesture itself, so it must know the real answer from
 * mount to render correctly the instant a tap resolves. The discipline
 * `ClaimChoices`'s own `answerId: string | null` prop enforces from the
 * *outside* is enforced here from the *inside* instead: every render
 * derives `revealedAnswerId` from `committed`, never reads the `answerId`
 * prop directly for paint, and `committed` starts `null` — so there is
 * still no render in which the verdict is held and merely not painted.
 *
 * # Abstention is a real row, not a lesser one
 *
 * Appended to the same row list, same size and weight as every real
 * option (Def. 9.1: "never a lesser option," the same rule
 * `CommitmentControl` already holds for its own button grid). Tapping it
 * commits `{ kind: "abstain" }` and reveals exactly what tapping a real
 * option would: the *answer's* row still marks itself correct, because
 * "a learner who abstained sees exactly what a learner who answered sees"
 * (#1220's own acceptance criterion) — abstention withholds a claim, it
 * does not withhold the reveal.
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
    // A closed, one-shot action (Def. 9.1) — a second tap after the first
    // is not a correction, it is a control that should already be gone
    // (every button below is `disabled` once committed).
    if (committed !== null) return
    onCommit(commitment)
    setCommitted(commitment)
  }

  // Derived, never the raw prop: this is what keeps the answer unpainted
  // until a commitment actually lands, the same way `answerId: null` keeps
  // `ClaimChoices` from painting one before the caller reveals it.
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
          // Before a commitment nothing is resolved; after it, the answer
          // and the player's own pick are the only two rows that say
          // anything — identical to `ClaimChoices`'s own resolution
          // states, since tap-to-commit changes *when* the verdict is
          // decided, not what it looks like once it is.
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
