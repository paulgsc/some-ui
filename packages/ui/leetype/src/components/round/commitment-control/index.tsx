import type { FC, ReactNode } from "react"
import { useState } from "react"
import type { Commitment, CommitmentOption } from "@leetype/types/commitment"
import { CircleHelp } from "lucide-react"
import { cn } from "some-ui-utils"

/**
 * Not part of a caller's closed set (#1200 owns those) — this is the one
 * abstention Def. 9.1 requires *every* commitment control to offer, added
 * here rather than trusted to each call site so "always includes an
 * explicit abstention" holds by construction, the same posture
 * `SourcePanel` takes on "no precondition anywhere in its call path."
 */
const ABSTAIN_LABEL = "Not sure"

type CommitmentControlProps = {
  /** The closed set's real choices. What they are is #1200's call, not this one's. */
  options: ReadonlyArray<CommitmentOption>
  /**
   * Fires exactly once, synchronously, the instant a tap resolves — before
   * this component's own re-render paints `reveal`. That ordering is
   * Ax. 9.2's whole point: once the answer is visible no later response
   * carries information about the learner's prior state, so the commitment
   * has to exist in the caller's hands before anything the answer could
   * contaminate gets painted.
   */
  onCommit: (commitment: Commitment) => void
  /**
   * What appears the instant a commitment lands — an artifact's answer, a
   * verdict, whatever the caller's round means by "the reveal." Absent
   * before any tap; rendered unconditionally on the very next render once
   * one lands, no matter which option (abstention included) was tapped.
   * `undefined` is a caller with nothing to reveal here, not a missing
   * reveal — it still satisfies "no confirmation, no delay."
   */
  reveal?: ReactNode
  className?: string
}

/**
 * The one blocking gesture in the whole design (C3, #1215): a single tap,
 * from a closed set that always includes an explicit "not sure," recorded
 * before the reveal it immediately and unconditionally unlocks.
 *
 * # Why a button group and not a radio group
 *
 * `ClaimChoices` is select-then-resolve: picking a row records a choice
 * that a *separate* submission elsewhere later resolves against an answer.
 * A commitment has no such second step — Def. 9.1 calls it "a single,
 * cheap, mandatory-before-reveal action," and Prop. 9.1's whole argument
 * depends on the tap itself being the observation, not a preview of one a
 * learner could still change their mind about. So each option is a plain
 * button that commits on tap, not an `<input type="radio">` whose checked
 * state a learner could arrow through before ever meaning to answer.
 *
 * # Never a lesser option
 *
 * Abstention renders through the exact same button classes, at the exact
 * same size, in the exact same grid, as every real choice — no `text-xs`,
 * no reduced hit target, no visually-recessive treatment. The only thing
 * that marks it apart is a glyph, which is additive rather than a demotion
 * of anything else on the row.
 *
 * # Standalone by design
 *
 * Not wired to the artifact switcher (C1, Step 6) — this component takes
 * `options` and two callbacks and nothing else, so nothing here could gate
 * or block anything else a round renders. A learner may look at every
 * artifact before tapping; this control has no way to know or care whether
 * they did.
 */
export const CommitmentControl: FC<CommitmentControlProps> = ({
  options,
  onCommit,
  reveal,
  className,
}) => {
  const [committed, setCommitted] = useState<Commitment | null>(null)

  const commit = (commitment: Commitment): void => {
    // A closed, one-shot action (Def. 9.1: "a single... action") — a second
    // tap after the first is not a correction, it is a control that should
    // already be gone (every button below is `disabled` once committed).
    if (committed !== null) return
    onCommit(commitment)
    setCommitted(commitment)
  }

  const isPicked = (commitment: Commitment): boolean => {
    if (committed === null) return false
    if (commitment.kind === "abstain") return committed.kind === "abstain"
    return committed.kind === "choice" && committed.id === commitment.id
  }

  const optionClass = (picked: boolean): string =>
    cn(
      "flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-4 py-2.5 text-center text-sm font-medium transition-colors duration-150",
      "border-border/60 bg-card text-foreground",
      committed === null && "hover:bg-card/70",
      committed !== null && !picked && "opacity-50",
      picked && "border-primary bg-primary/10"
    )

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div role="group" className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const commitment: Commitment = { kind: "choice", id: option.id }
          const picked = isPicked(commitment)
          return (
            <button
              key={option.id}
              type="button"
              disabled={committed !== null}
              aria-pressed={picked}
              onClick={() => commit(commitment)}
              className={optionClass(picked)}
            >
              {option.label}
            </button>
          )
        })}

        <button
          type="button"
          disabled={committed !== null}
          aria-pressed={isPicked({ kind: "abstain" })}
          onClick={() => commit({ kind: "abstain" })}
          className={optionClass(isPicked({ kind: "abstain" }))}
        >
          <CircleHelp className="size-4 shrink-0" aria-hidden="true" />
          {ABSTAIN_LABEL}
        </button>
      </div>

      {committed !== null && reveal}
    </div>
  )
}
