import type { FC } from "react"
import type { PromptBlock } from "@leetype/types/exercise"
import { PageControls } from "@some-ui/shared"
import { cn, useFittedPage } from "some-ui-utils"

type PromptPanelProps = {
  /**
   * The step's one-sentence goal. Always shown, never paged: it is the
   * instruction, and an instruction that can be paged away is not one.
   */
  goal: string
  /** Everything else the step wants read. */
  blocks: ReadonlyArray<PromptBlock>
  /** 1-based, for the "Step 5 / 12" line. */
  position: number
  total: number
  className?: string
}

/**
 * The forcing question, above the typing viewport and outside the scroll
 * model entirely.
 *
 * # Why "outside the scroll model" is the whole design
 *
 * The prompt is read in about five seconds and then held in peripheral
 * vision for the sixty seconds of typing that follow. If it lived inside the
 * scrolling container, three questions would immediately become live —
 * *does the prompt consume caret height*, *should auto-scroll centre on
 * prompts*, *what happens when the prompt wraps* — and the renderer would
 * have to learn what a prompt is to answer them. None of those questions
 * gets asked here, because the prompt is not in the box that scrolls.
 *
 * # The overflow answer, recorded
 *
 * `docs/ui-fit/README.md` opens by naming the leetype nav modals as the
 * violation that produced the doctrine. A prompt panel that reached for
 * `overflow-y-auto` when a prompt ran long would be the same mistake in a
 * new place, and this is the surface where it would be worst.
 *
 * So, in the doctrine's own order:
 *
 * 1. **Authoring constraint first.** `types/exercise.ts` bounds a step's
 *    goal to one sentence, and the bound is enforced by the schema. A prompt
 *    that needs a scrollbar is a step that was too broad.
 * 2. **Then a measured page.** For the long one that arrives anyway — a
 *    corpus is host-supplied data, and hostile input is not hypothetical —
 *    `useFittedPage` measures the box and shows the lines that fit, with
 *    `PageControls` for the rest. Nothing is silently cut off, and the
 *    panel's height does not change with its contents.
 * 3. **Never a scrollbar.** There is no `overflow-*` and no `max-h-[Nvh]`
 *    in this file, and no `scroll-intent:` opt-out.
 *
 * The height being invariant across a typing run is not a nicety either: a
 * prompt that reflows mid-step moves the code under the player's hands,
 * which is a flow-state break on the one surface where that is unforgivable.
 * The panel's box is fixed by the layout (`basis-1/5`, from `ExerciseCard`),
 * so nothing it contains can resize it.
 *
 * It imports nothing from the typing engine. No caret, no slots, no WPM.
 */
export const PromptPanel: FC<PromptPanelProps> = ({
  goal,
  blocks,
  position,
  total,
  className,
}) => {
  const lines = blocks.flatMap((block) => block.lines)
  const {
    viewportRef,
    contentRef,
    pageItems,
    page,
    pageCount,
    next,
    previous,
  } = useFittedPage(lines, { minPerPage: 1, maxPerPage: 8 })

  return (
    <div
      className={cn(
        "flex shrink-0 basis-1/5 flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3",
        className
      )}
    >
      <div className="flex shrink-0 items-baseline justify-between gap-3">
        <p className="text-balance text-sm font-semibold text-card-foreground">
          {goal}
        </p>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {position}/{total}
        </span>
      </div>

      <div ref={viewportRef} className="min-h-0 flex-1">
        <div ref={contentRef} className="flex flex-col gap-1">
          {pageItems.map((line) => (
            <p
              // Prompt lines are prose with no id of their own, and two
              // identical lines in one prompt are indistinguishable by any
              // measure — the text is the only key available.
              key={`${page}-${line}`}
              className="text-pretty text-xs leading-relaxed text-muted-foreground"
            >
              {line}
            </p>
          ))}
        </div>
      </div>

      <PageControls
        page={page}
        pageCount={pageCount}
        onPrevious={previous}
        onNext={next}
        label="prompt lines"
      />
    </div>
  )
}
