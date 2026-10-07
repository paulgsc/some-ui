import type { FC } from "react"
import { DiffCard } from "@leetype/components/reading-game/diff-card"
import { readingHunkOfDiff } from "@leetype/lib/leetype/reading-probe"
import type { RoundDiffOption } from "@leetype/lib/leetype/round-cycle"
import { cn } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import { Check } from "lucide-react"

/** A→E, the same badges `RoundChoices` puts on its rows; `D` holds at most five. */
const BADGES = ["A", "B", "C", "D", "E"] as const

type DiffSetChoicesProps = {
  /** `D`, already in presentation order: the caller shuffles, so position never leaks which is admissible. */
  options: ReadonlyArray<RoundDiffOption>
  /** `A`'s language, for the code cards' highlighting. */
  language: string
  /** Index into `options` of the diff already chosen, or null before one is. */
  picked: number | null
  onPick: (index: number) => void
  className?: string
}

/**
 * `D`, rendered (Def. 1.4, Def. 8.1 case 2): every candidate rewrite as a
 * `DiffCard`, each with one button that selects it. The selection is the first half of the learner's
 * pair `(d, p)`, and it is one-shot like every commitment on this surface
 * (Def. 9.1): once a diff is picked every button disables and the picked
 * card says so. Nothing here marks which diff is admissible; that is the
 * cycle's to reveal, after the pair is complete.
 */
export const DiffSetChoices: FC<DiffSetChoicesProps> = ({
  options,
  language,
  picked,
  onPick,
  className,
}) => (
  <div className={cn("flex min-w-0 flex-col gap-4", className)}>
    <p className="text-pretty text-base font-medium text-foreground">
      Which rewrite fits the budget at the new bounds?
    </p>
    {options.map((option, index) => {
      const badge = BADGES[index] ?? String(index + 1)
      const isPicked = picked === index
      return (
        <section
          // `DiffSetSchema` forbids a repeated hunk, so the hunk is a key.
          key={JSON.stringify(option.member.hunk)}
          aria-label={`Rewrite ${badge}`}
          className={cn(
            "flex min-w-0 flex-col gap-2 rounded-xl border p-2",
            isPicked ? "border-primary/60 bg-primary/5" : "border-border/60",
            picked !== null && !isPicked && "opacity-60"
          )}
        >
          <DiffCard hunk={readingHunkOfDiff(option.member.hunk, language)} />
          <Button
            type="button"
            variant={isPicked ? "default" : "outline"}
            className="min-h-11 w-full gap-2"
            disabled={picked !== null}
            onClick={() => onPick(index)}
          >
            {isPicked ? (
              <>
                <Check className="size-4" aria-hidden="true" /> Rewrite {badge}{" "}
                chosen
              </>
            ) : (
              `Choose rewrite ${badge}`
            )}
          </Button>
        </section>
      )
    })}
  </div>
)
