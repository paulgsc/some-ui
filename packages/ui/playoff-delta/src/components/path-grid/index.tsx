import type { JSX } from "react"
import { delay } from "@playoff-delta/components/slides/shared"
import {
  cellChanges,
  isOpen,
  SEEDS,
  type CellChange,
  type StoryPaths,
  type StoryWeek,
} from "@playoff-delta/lib/story"
import { counted } from "@some-ui/core-utils"

/** Complete class strings, so a content scan sees every one. */
const CELL: Readonly<Record<CellChange, string>> = {
  open: "pd-cell pd-cell--open",
  closed: "pd-cell pd-cell--closed",
  opened: "pd-cell pd-cell--opened",
  pruned: "pd-cell pd-cell--pruned",
}

const rowLabel = (x: number): string =>
  x === 0 ? "never win again" : `+${counted(x, "win")}`

type Row = {
  readonly label: string
  readonly offset: number
  readonly cells: ReadonlyArray<{
    readonly seed: number
    readonly change: CellChange
  }>
}

/**
 * The paths grid: rows are wins still needed (0 = never win again), columns
 * are seeds. A lit cell is an open path. Given `week`, it shows the week's
 * change: pruned paths flash and cross out, newly opened ones bloom, and with
 * none left the grid is absorbed.
 */
export const PathGrid = ({
  paths,
  week,
}: {
  paths: StoryPaths
  week?: StoryWeek
}): JSX.Element => {
  const changes: ReadonlyArray<ReadonlyArray<CellChange>> = week
    ? cellChanges(week)
    : paths.map((_, x) =>
        SEEDS.map((s): CellChange => (isOpen(paths, x, s) ? "open" : "closed"))
      )
  const rows: ReadonlyArray<Row> = changes.map((row, x) => ({
    label: rowLabel(x),
    offset: x * SEEDS.length,
    cells: row.map((change, i) => ({ seed: i + 1, change })),
  }))
  const absorbed = changes.every((row) =>
    row.every((c) => c === "closed" || c === "pruned")
  )
  return (
    <div className={absorbed ? "pd-grid pd-grid--absorbed" : "pd-grid"}>
      <span />
      {SEEDS.map((s) => (
        <span
          key={s}
          className="pd-mono text-muted-foreground pd-small text-center"
        >
          #{s}
        </span>
      ))}
      {rows.map((row) => [
        <span
          key={row.label}
          className="pd-mono text-muted-foreground pd-small pr-[1cqw] whitespace-nowrap"
        >
          {row.label}
        </span>,
        ...row.cells.map(({ seed, change }) => (
          <i
            key={`${row.label}-${seed}`}
            role="img"
            className={CELL[change]}
            style={delay(0.15 + (row.offset + seed) * 0.012)}
            aria-label={`${row.label}, seed ${seed}: ${change}`}
          />
        )),
      ])}
      {absorbed && week ? (
        <div className="pd-in absolute inset-0 flex flex-col items-center justify-center gap-[1cqw] [--d:1.6s]">
          <b className="bg-background text-foreground rounded-md px-[2cqw] text-[6cqw]">
            No paths left.
          </b>
          <span className="bg-background text-muted-foreground pd-say px-[2cqw]">
            Out, for good.
          </span>
        </div>
      ) : null}
    </div>
  )
}
