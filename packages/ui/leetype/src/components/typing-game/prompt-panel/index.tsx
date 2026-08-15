import type { FC, ReactNode } from "react"
import type { ReadBlock } from "@leetype/types/exercise"
import { PageControls } from "@some-ui/shared"
import { assertNever, cn, useFittedPage } from "some-ui-utils"

import type { EvidenceRow } from "./rows"
import { evidenceRowsOf } from "./rows"

type PromptPanelProps = {
  /**
   * The step's one-sentence goal. Always shown, never paged: it is the
   * instruction, and an instruction that can be paged away is not one.
   */
  goal: string
  /** Everything else the step wants read — prose and evidence alike. */
  blocks: ReadonlyArray<ReadBlock>
  /** 1-based, for the "Step 5 / 12" line. */
  position: number
  total: number
  className?: string
}

/**
 * One row's presentation. Descending prominence, per the doctrine this
 * panel replaced a description card with: a failure class or constraint
 * reads loudest, a discriminating observation reads as evidence (`font-mono`,
 * the same register `CodeDisplay` uses for real code), and plain prose stays
 * the quiet default it always was.
 */
function renderRow(row: EvidenceRow): ReactNode {
  switch (row.kind) {
    case "prompt-line": {
      return (
        <p
          key={row.id}
          className="text-pretty text-xs leading-relaxed text-muted-foreground"
        >
          {row.text}
        </p>
      )
    }
    case "transition": {
      return (
        <p
          key={row.id}
          className="text-pretty font-mono text-xs leading-relaxed text-muted-foreground"
        >
          {row.label !== undefined && (
            <span className="text-card-foreground">{row.label}: </span>
          )}
          {row.before}
          <span aria-hidden="true"> → </span>
          <span className="sr-only"> becomes </span>
          {row.after}
        </p>
      )
    }
    case "trace-headline": {
      return (
        <p
          key={row.id}
          className="font-mono text-xs font-semibold uppercase tracking-wide text-destructive"
        >
          {row.text}
        </p>
      )
    }
    case "trace-observation": {
      return (
        <p
          key={row.id}
          className="text-pretty font-mono text-xs leading-relaxed text-muted-foreground"
        >
          <span className="text-card-foreground">{row.label}: </span>
          {row.value}
        </p>
      )
    }
    case "region": {
      return (
        <p
          key={row.id}
          className="text-pretty text-xs leading-relaxed text-muted-foreground"
        >
          <span aria-hidden="true" className="text-card-foreground">
            ▸{" "}
          </span>
          {row.label}
        </p>
      )
    }
    default: {
      return assertNever(row)
    }
  }
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
 * # Evidence, not exposition
 *
 * `blocks` is prose (`prompt`) and evidence (`transition`/`trace`/`region`)
 * alike (LTY-EVIDENCE E2). `evidenceRowsOf` (`./rows`) flattens both into the
 * atomic rows `useFittedPage` pages over — a trace block's headline and each
 * of its observations are separate rows, the same granularity a multi-line
 * prompt block already had one row per line. `EVIDENCE_ROW_BUDGET` bounds
 * that count in the corpus (`./corpus-lint.test.ts`), so the pagination path
 * below stays what it always was: a defensive floor, not a feature a valid
 * corpus reaches.
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
  const rows = evidenceRowsOf(blocks)
  const {
    viewportRef,
    contentRef,
    pageItems,
    page,
    pageCount,
    next,
    previous,
  } = useFittedPage(rows, { minPerPage: 1, maxPerPage: 8 })

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
          {pageItems.map(renderRow)}
        </div>
      </div>

      <PageControls
        page={page}
        pageCount={pageCount}
        onPrevious={previous}
        onNext={next}
        label="evidence"
      />
    </div>
  )
}
