import type { JSX } from "react"

import { journey, JOURNEY_IDS } from "@/lib/journey"
import { JourneyStatus } from "@/components/journey-status"

/** A day before the fixture's `NOW`, so every time is said with its date. */
const SINCE = "2026-10-23T16:14:00.000Z"
const NOW = new Date("2026-10-24T21:30:00.000Z")

/** A scout's title as long as the form takes it on one line or two. */
const TITLE =
  "Senior Platform Engineer, Developer Infrastructure · Northwind Avionics"

/**
 * Every journey state's card (J0), stacked as the Jobs wing stacks its cards
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
            why: "not-kept",
          })}
          noun="them"
          now={NOW}
        />
        <p style={{ margin: 0, padding: "12px 14px", fontSize: 12 }}>
          The morning run reads these and your voice notes.
        </p>
      </section>
    ))}
  </div>
)
