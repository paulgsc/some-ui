/**
 * What this morning's run did, at the top of Today (RUN1, `lib/jobs/morning`):
 * J0's card wearing the run's state, its words under the bar, and whatever
 * the screen offers beside them. Its pop-up also lists the last runs as home
 * told them (RUN3).
 */
import type { JSX, ReactNode } from "react"
import type { JobsRun } from "@some-ui/job-desk"

import type { Morning } from "@/lib/jobs/morning"
import {
  MORNING_IDS,
  MORNING_LEGEND,
  morningLabel,
  morningRoad,
  morningSaid,
  morningSign,
  morningStop,
  morningTheme,
  RUNS_HEADING,
  runSaid,
} from "@/lib/jobs/morning"
import { StatusCard } from "@/components/journey-status"

/** The last runs, newest first, as the pop-up lists them. */
const LastRuns = ({
  runs,
  now,
}: {
  runs: ReadonlyArray<JobsRun>
  now: Date
}): JSX.Element => (
  <section aria-label={RUNS_HEADING} className="flex flex-col gap-1.5">
    <h3 className="text-muted-foreground text-xs font-medium">
      {RUNS_HEADING}
    </h3>
    <ol className="flex flex-col gap-1.5">
      {runs.map((run) => (
        <li key={run.startedAt} className="break-words text-sm leading-snug">
          {runSaid(run, now)}
        </li>
      ))}
    </ol>
  </section>
)

export const MorningCard = ({
  morning,
  runs,
  now,
  children,
}: {
  morning: Morning
  /** Home's records of the last runs, newest first; none before it told any. */
  runs: ReadonlyArray<JobsRun>
  now: Date
  children?: ReactNode
}): JSX.Element => {
  const said = morningSaid(morning, now)
  return (
    <StatusCard
      title={said.title}
      more={runs.length > 0 ? <LastRuns runs={runs} now={now} /> : undefined}
      state={{
        id: morning.id,
        theme: morningTheme(morning.id),
        at: morningStop(morning.id),
        sign: morningSign(morning.id),
        said,
        label: morningLabel(said),
        road: morningRoad(morning.id),
        every: MORNING_IDS.map((id) => ({
          id,
          title: MORNING_LEGEND[id],
          theme: morningTheme(id),
          at: morningStop(id),
          sign: morningSign(id),
        })),
      }}
    >
      <div className="flex flex-col gap-3 px-3.5 py-3">
        <p className="text-muted-foreground text-sm">{said.line}</p>
        {children}
      </div>
    </StatusCard>
  )
}
