import type { FC, ReactNode } from "react"
import { useState } from "react"
import type { Commitment, CommitmentOption } from "@leetype/types/commitment"
import { CircleHelp } from "lucide-react"
import { cn } from "some-ui-utils"

/**
 * The abstention Def. 9.1 requires of *every* commitment control, added here
 * rather than by callers so it always holds.
 */
const ABSTAIN_LABEL = "Not sure"

type CommitmentControlProps = {
  /** The closed set's real choices, supplied by the caller. */
  options: ReadonlyArray<CommitmentOption>
  /**
   * Fires once, synchronously, before `reveal` paints (Ax. 9.2: once the
   * answer is visible, no later response tells anything about prior state).
   */
  onCommit: (commitment: Commitment) => void
  /**
   * What appears once a commitment lands, whichever option (abstention
   * included) was tapped. `undefined` means nothing to reveal here.
   */
  reveal?: ReactNode
  className?: string
  /** The button group's accessible name (`role="group"` has none of its own). */
  groupLabel?: string
}

/**
 * The one blocking gesture in the design: a single tap from a closed set
 * that always includes "not sure," recorded before the reveal it unlocks.
 *
 * Buttons, not radios: the tap itself is the observation (Prop. 9.1), not a
 * selection a learner could arrow through before meaning to answer.
 *
 * Abstention uses the same classes, size and grid as every choice; only a
 * glyph marks it.
 *
 * Standalone: it takes `options` and callbacks only, so it cannot gate
 * anything else a round renders.
 */
export const CommitmentControl: FC<CommitmentControlProps> = ({
  options,
  onCommit,
  reveal,
  className,
  groupLabel = "Commitment",
}) => {
  const [committed, setCommitted] = useState<Commitment | null>(null)

  const commit = (commitment: Commitment): void => {
    // One-shot (Def. 9.1): every button is disabled once committed.
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
      <div
        role="group"
        aria-label={groupLabel}
        className="grid grid-cols-2 gap-2"
      >
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
