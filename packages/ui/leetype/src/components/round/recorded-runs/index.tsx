import type { FC } from "react"
import type {
  RoundRuns,
  RunBounds,
  RunLine,
} from "@leetype/lib/leetype/round-runs"
import { runLinesOf } from "@leetype/lib/leetype/round-runs"
import { cn } from "some-ui-utils"

const BOUNDS_LABEL: Record<RunBounds, string> = {
  before: "Old bounds",
  after: "New bounds",
}

type RecordedRunsProps = {
  /** The round's transcript, already checked against the round's bytes (`resolveRoundRuns`). */
  transcript: RoundRuns
  /** The transcript label of the rewrite the learner committed to (`variantOf`). */
  chosen: string
  /** The round's constraint dimensions in authored order, so sizes read as the Bounds card lists them. */
  dimensions: ReadonlyArray<string>
  className?: string
}

function sentence(clause: string): string {
  return `${clause.charAt(0).toUpperCase()}${clause.slice(1)}.`
}

const RunList: FC<{ title: string; lines: ReadonlyArray<RunLine> }> = ({
  title,
  lines,
}) => (
  <div className="min-w-0">
    <p className="text-sm font-medium text-foreground">{title}</p>
    <ul className="mt-1.5 flex flex-col gap-2">
      {lines.map((line) => (
        <li
          key={line.bounds}
          className="min-w-0 rounded-lg border border-border/60 px-3 py-2"
        >
          <p className="text-xs text-muted-foreground">
            {BOUNDS_LABEL[line.bounds]} ·{" "}
            <span className="font-mono">{line.sizes}</span>
          </p>
          <p className="mt-0.5 text-pretty text-sm text-foreground [overflow-wrap:anywhere]">
            {sentence(line.outcome)}
          </p>
          {line.detail !== null && (
            <p className="mt-0.5 line-clamp-3 text-pretty text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {line.detail}
            </p>
          )}
        </li>
      ))}
    </ul>
  </div>
)

/**
 * `r` (Def. 4.1), as the round shows it (X2, #1223): what the original
 * program and the learner's chosen rewrite did when they were run at the
 * old bounds (`C`) and the new ones (`C′`).
 *
 * # Only after the commitment
 *
 * `RoundSession` adds this artifact once `(d, p)` is committed, never
 * before: shown earlier, a run of each rewrite at `C′` would answer the
 * question (Ax. 9.2, a run is assistance with respect to its own outcome).
 *
 * # Evidence, never the grade
 *
 * Every line says what happened on one input (Prop. 4.1): which sizes,
 * whether it finished, how long it took on the recording machine, what it
 * printed. No line names a class or reads one off a time (Thm. 4.1,
 * Cor. 4.1), and none says whether the rewrite fits the budget: that is
 * the cost graphs' verdict, already shown in the outcome above, and this
 * panel says so rather than restating it. No counts either (Prop. 8.1).
 */
export const RecordedRuns: FC<RecordedRunsProps> = ({
  transcript,
  chosen,
  dimensions,
  className,
}) => {
  const groups = [
    {
      title: "The original program",
      lines: runLinesOf(transcript, "A", dimensions),
    },
    {
      title: "Your rewrite",
      lines: runLinesOf(transcript, chosen, dimensions),
    },
  ].filter((group) => group.lines.length > 0)
  if (groups.length === 0) return null

  return (
    <section
      aria-label="Recorded runs"
      className={cn("flex min-w-0 flex-col gap-3", className)}
    >
      <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
        Each program was run on a worst-case input at the old bounds and at the
        new ones. A run shows what happened on that one input. Whether a rewrite
        fits the budget comes from its cost, not from a run.
      </p>
      {groups.map((group) => (
        <RunList key={group.title} title={group.title} lines={group.lines} />
      ))}
      <p className="text-pretty text-xs text-muted-foreground">
        Times are from the machine that recorded these runs, and vary from one
        recording to the next.
      </p>
    </section>
  )
}
