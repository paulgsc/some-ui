import type { JSX } from "react"
import type {
  PracticeCounts,
  PracticeRecord,
} from "@topik/lib/topik/read-aloud/records"
import { recentCounts } from "@topik/lib/topik/read-aloud/records"

type PracticeRecordViewProps = {
  record: PracticeRecord
  /** The learner's local day, as the record keys it. */
  today: string
}

const minutes = (ms: number): string => {
  if (ms <= 0) return "0 min"
  const whole = Math.round(ms / 60_000)
  return whole < 1 ? "<1 min" : `${whole} min`
}

const Row = ({
  label,
  counts,
}: {
  label: string
  counts: PracticeCounts
}): JSX.Element => (
  <div className="flex items-baseline justify-between gap-3 py-1.5">
    <dt className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
      {label}
    </dt>
    <dd className="text-right text-sm tabular-nums">
      {counts.reps} read · {counts.sets} {counts.sets === 1 ? "set" : "sets"} ·{" "}
      {minutes(counts.practiceMs)}
    </dd>
  </div>
)

/**
 * The practice record, as the learner sees it (adaptive-learning canon
 * Def. 6.6): how many reps ran to the end, how many sets were finished, and
 * the practice those reps are credited with, today, over the last week and
 * in all. Counts only: no rate, no pace, nothing that improves when a stuck
 * report is withheld (Prop. 6.4 (iii)).
 */
export const PracticeRecordView = ({
  record,
  today,
}: PracticeRecordViewProps): JSX.Element => (
  <dl
    aria-label="Your reading aloud"
    data-slot="read-aloud-record"
    className="border-border w-full max-w-xs divide-y rounded-2xl border px-4 py-1"
  >
    <Row label="Today" counts={recentCounts(record, today, 1)} />
    <Row label="This week" counts={recentCounts(record, today, 7)} />
    <Row label="In all" counts={record.totals} />
  </dl>
)
