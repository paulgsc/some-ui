import type { FC, ReactNode } from "react"
import { useMemo } from "react"
import type { ReadBlock } from "@leetype/types/exercise"
import { assertNever, cn } from "@some-ui/core-utils"
import { useFittedPage } from "@some-ui/react-hooks"
import { PageControls } from "@some-ui/shared"

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
 * One row's presentation, in descending prominence: a failure class or
 * constraint loudest, an observation as evidence (`font-mono`, like real
 * code), plain prose the quiet default.
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
 * model entirely. Read in seconds, then held in peripheral vision; inside
 * the scroller it would raise caret-height, auto-scroll and wrapping
 * questions the renderer would need to understand prompts to answer.
 *
 * # Overflow (`docs/ui-fit/README.md`)
 *
 * 1. **Authoring constraint first.** The schema bounds a goal to one
 *    sentence; a prompt needing a scrollbar is a step too broad.
 * 2. **Then a measured page.** For hostile input that arrives anyway,
 *    `useFittedPage` shows the lines that fit, with `PageControls` for the
 *    rest. Nothing is cut off silently.
 * 3. **Never a scrollbar.** No `overflow-*`, no `max-h-[Nvh]`, no
 *    `scroll-intent:` opt-out in this file.
 *
 * The box is fixed by the layout (`basis-1/5`, from `ExerciseCard`), so a
 * long prompt never reflows the code under the player's hands.
 *
 * `blocks` is prose and evidence alike; `evidenceRowsOf` (`./rows`) flattens
 * them into the rows `useFittedPage` pages over (a trace's headline and each
 * observation are separate rows). `EVIDENCE_ROW_BUDGET` bounds that count in
 * the corpus, so paging stays a defensive floor.
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
  // Memoized on `blocks`: useFittedPage treats a new `rows` identity as a
  // content change, so rebuilding per engine tick would restart its
  // grow/overflow/shrink cycle every tick.
  const rows = useMemo(() => evidenceRowsOf(blocks), [blocks])
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
