import type { FC } from "react"
import { useId } from "react"
import type { ReadingOption } from "@leetype/lib/leetype/reading-probe"
import { Check, X } from "lucide-react"
import { cn } from "some-ui-utils"

/** A→B→C→D. Beyond the fourth option a card is a quiz page, not a card. */
const BADGES = ["A", "B", "C", "D", "E"] as const

type ClaimChoicesProps = {
  /** The forcing question. Read at full size — never a caption. */
  prompt: string
  options: ReadonlyArray<ReadingOption>
  /** The option the player has picked, or `null` before they pick one. */
  selectedId: string | null
  onSelect: (id: string) => void
  /**
   * Which option the step's author wrote about this step. Passed only once
   * the player has answered — `null` before that, so there is no render in
   * which the component holds the answer and merely declines to paint it.
   */
  answerId: string | null
  className?: string
}

/**
 * The answer list (LTY-MOBILE): a real radio group that happens to look like
 * rows.
 *
 * # Why a list and not four cards
 *
 * Four bordered rectangles under a bordered code card give the screen two
 * competing dominant blocks, and the diff stops being the object the learner
 * is inspecting. The rows here carry their weight in a badge, a hairline and
 * a selection rail instead of a border apiece, which leaves the hunk as the
 * only container on the screen that reads as an object.
 *
 * # Accessibility is the implementation, not a pass over it
 *
 * Native `<input type="radio">` inside a `<label>`, grouped by `name`, inside
 * a `<fieldset>` whose `<legend>` is the prompt. Arrow keys move the
 * selection, the whole row is the hit target because the label wraps it, and
 * the group announces itself without a single `role` attribute. The visual
 * treatment is entirely `peer-checked:` styling over a visually-hidden input,
 * so nothing had to be reimplemented to look right.
 *
 * Correctness is never colour alone: a resolved row carries a check or a
 * cross glyph and a word ("Correct" / "Not this one"), and the badge column
 * keeps its letter either way.
 */
export const ClaimChoices: FC<ClaimChoicesProps> = ({
  prompt,
  options,
  selectedId,
  onSelect,
  answerId,
  className,
}) => {
  const groupName = useId()
  const answered = answerId !== null

  return (
    <fieldset className={cn("min-w-0 border-0 p-0", className)}>
      <legend className="mb-3 text-pretty text-base font-medium text-foreground">
        {prompt}
      </legend>

      <div className="flex flex-col gap-2">
        {options.map((option, index) => {
          const selected = option.id === selectedId
          const isAnswer = option.id === answerId
          // Before submission nothing is resolved; after it, the answer and
          // the player's own pick are the only two rows that say anything.
          const resolution = !answered
            ? "open"
            : isAnswer
              ? "correct"
              : selected
                ? "missed"
                : "quiet"

          return (
            <label
              key={option.id}
              className={cn(
                "group relative flex min-h-11 cursor-pointer items-start gap-3 rounded-lg py-2.5 pl-3 pr-3 transition-colors duration-150",
                "border-l-2 bg-card/40",
                resolution === "open" &&
                  (selected
                    ? "border-l-primary bg-card text-foreground"
                    : "border-l-border/40 text-muted-foreground hover:bg-card/70"),
                resolution === "correct" &&
                  "border-l-emerald-500 bg-emerald-500/[0.07] text-foreground",
                resolution === "missed" &&
                  "border-l-rose-500 bg-rose-500/[0.06] text-foreground",
                resolution === "quiet" &&
                  "border-l-border/30 text-muted-foreground/60",
                answered && "cursor-default"
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={option.id}
                checked={selected}
                disabled={answered}
                onChange={() => onSelect(option.id)}
                // Visually hidden rather than `hidden`/`display:none`, which
                // would take it out of the tab order and out of the
                // arrow-key group along with it.
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "mt-px flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums",
                  resolution === "open" && selected
                    ? "border-primary text-primary"
                    : "border-border/60 text-muted-foreground/70",
                  resolution === "correct" &&
                    "border-emerald-500 text-emerald-400",
                  resolution === "missed" && "border-rose-500 text-rose-400",
                  // The focus ring rides the badge: the input is
                  // visually hidden, so `peer-focus-visible` is the only way
                  // a keyboard user ever sees where they are.
                  "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background"
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
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
