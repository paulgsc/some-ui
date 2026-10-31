import type { JSX } from "react"
import type { JobsRun } from "@some-ui/job-desk"

import { MORNING_IDS } from "@/lib/jobs/morning"
import { journey, JOURNEY_IDS } from "@/lib/journey"
import { MorningCard } from "@/components/jobs/morning-card"
import { JourneyStatus } from "@/components/journey-status"

/** A day before the fixture's `NOW`, so every time is said with its date. */
const SINCE = "2026-10-23T16:14:00.000Z"
const NOW = new Date("2026-10-24T21:30:00.000Z")

/** A scout's title as long as the form takes it on one line or two. */
const TITLE =
  "Senior Platform Engineer, Developer Infrastructure · Northwind Avionics"

/** The longest reason a run may give (`MAX_PROBLEM`), as its record words it. */
const PROBLEM =
  "This session couldn’t search the web, and the voice note from last night couldn’t be heard either, so there are no picks today and that note waits for tomorrow’s run to try."

/** A week of runs, the most the pop-up lists, each with the longest words. */
const RUNS: ReadonlyArray<JobsRun> = Array.from({ length: 7 }, (_, i) => ({
  schema: "some-ui.routine-run/1",
  routine: "jobs",
  startedAt: new Date(Date.parse("2026-10-24T14:52:07Z") - i * 86_400_000)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z"),
  finishedAt: "2026-10-24T15:01:40Z",
  outcome: "partly",
  found: { postings: 48, scouts: 2, decisions: 5 },
  added: [
    {
      folder: "brief",
      name: "digest-2026-10-24.json",
      title: "5 picks from 48 postings",
    },
  ],
  problems: [PROBLEM],
}))

/**
 * Every journey state's card (J0), then every state of this morning's run
 * (RUN1) with its largest counts and a week of runs in its pop-up (RUN3), stacked as the Jobs wing stacks its cards
 * on the phone, each with the longest words the table says: several files
 * (`them`), a time with its date, a run's day (`../jobs-status-fit.spec.ts`).
 */
export const JobsStatusFixture = (): JSX.Element => (
  <div
    data-scroll-intent=""
    style={{
      height: "100%",
      overflowY: "auto",
      boxSizing: "border-box",
      padding: 16,
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}
  >
    <button type="button" data-fit-elsewhere="">
      Elsewhere
    </button>
    {JOURNEY_IDS.map((id) => (
      <section
        key={id}
        style={{ border: "1px solid var(--border)", borderRadius: 12 }}
      >
        <JourneyStatus
          title={TITLE}
          journey={journey(id, {
            since: SINCE,
            runDay: "2026-10-24",
          })}
          noun="them"
          now={NOW}
        />
        <p style={{ margin: 0, padding: "12px 14px", fontSize: 12 }}>
          The morning run reads these and your voice notes.
        </p>
      </section>
    ))}
    {MORNING_IDS.map((id) => (
      <MorningCard
        key={id}
        morning={{
          id,
          picked: 5,
          undecided: 4,
          seen: 48,
          lookedAt: SINCE,
          problem: PROBLEM,
          unrecorded: false,
        }}
        runs={RUNS}
        now={NOW}
      />
    ))}
  </div>
)
