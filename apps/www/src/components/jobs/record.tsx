/**
 * Jobs › Record: every pick taken, what came of it, and today's decisions
 * on their way to the morning run, the card wearing where they are
 * (`./applications`).
 */
import type { JSX } from "react"
import { dayOf, median } from "@some-ui/core-utils"

import { useMinuteClock } from "@/lib/clock"
import { kindJourney } from "@/lib/jobs/journey"
import { applicationsOf, courseOf, lastDelivered } from "@/lib/jobs/model"
import { rowOf } from "@/lib/jobs/record-view"
import { FILE_NAMES } from "@/lib/jobs/words"

import { Applications } from "./applications"
import {
  FileProblem,
  JourneyCard,
  Problem,
  useJobs,
  useJourneyContext,
} from "./parts"

export const JobsRecord = (): JSX.Element => {
  const { state } = useJobs()
  const applications = applicationsOf(state)
  const debriefs = state.log.flatMap((e) => (e.type === "debrief" ? [e] : []))
  const passed = state.log.filter((e) => e.type === "passed").length
  const minutes = median(
    debriefs.flatMap((d) => (d.minutes === null ? [] : [d.minutes]))
  )
  const last = lastDelivered(state, "decisions")
  const journey = kindJourney(useJourneyContext(), "decisions")
  const today = dayOf(useMinuteClock())
  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-2 gap-2 rounded-xl border p-3 text-sm tabular-nums">
        <span className="text-muted-foreground">Taken · passed</span>
        <span className="text-right">
          {applications.length} · {passed}
        </span>
        <span className="text-muted-foreground">Applied</span>
        <span className="text-right">
          {debriefs.filter((d) => d.result === "submitted").length}
        </span>
        <span className="text-muted-foreground">Median minutes</span>
        <span className="text-right">
          {minutes === null ? "–" : Math.round(minutes)}
        </span>
      </section>
      <p className="text-muted-foreground text-xs">
        Nothing here is edited or deleted, only added to.
      </p>
      <JourneyCard title={FILE_NAMES.decisions} journey={journey} noun="them">
        <p className="text-muted-foreground px-3.5 py-3 text-xs">
          The morning run reads these and your voice notes.
          {last ? ` Last sent ${last.day}.` : ""}
        </p>
        <FileProblem kind="decisions" />
      </JourneyCard>
      <Problem />
      {applications.length > 0 && (
        <Applications
          rows={applications.map((a) =>
            rowOf(a, courseOf(state, a, today, dayOf))
          )}
        />
      )}
    </div>
  )
}
