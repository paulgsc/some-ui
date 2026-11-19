import type { JSX } from "react"
import { useState } from "react"
import { inMemoryStorage } from "@some-ui/core-utils"
import type { SpanWhere, WorkPorts } from "@some-ui/rust-rounds"
import {
  createWorkTracker,
  WeekTimeChart,
  workSpans,
  WorkTrackerControl,
} from "@some-ui/rust-rounds"

const T0 = Date.parse("2026-11-19T17:40:00.000Z")
const MIN = 60_000

const WEEK = {
  id: "2026-w47",
  tickets: [{ id: "TB-101" }, { id: "TB-102" }, { id: "TB-103" }],
}

const where: SpanWhere = {
  week: WEEK.id,
  ticket: "TB-101",
  step: "academy",
  exercise: 1,
  points: [1, 2],
}

/** A stop that stops nothing. */
const none = (): (() => void) => () => undefined

/** A week with spans answered on three tickets, and one asking now. */
function fixturePorts(): WorkPorts {
  const record = workSpans(inMemoryStorage())
  record.keep(() => [
    {
      kind: "start",
      id: "a",
      at: new Date(T0 - 2 * 1440 * MIN).toISOString(),
      week: WEEK.id,
      ticket: "TB-101",
      step: "read",
      exercise: null,
      points: [1],
      device: "Phone",
    },
    {
      kind: "close",
      id: "a",
      at: new Date(T0 - 2 * 1440 * MIN + 110 * MIN).toISOString(),
      stoppedBy: "you",
      answer: "all",
      countedSeconds: 110 * 60,
    },
    {
      kind: "start",
      id: "b",
      at: new Date(T0 - 1440 * MIN).toISOString(),
      week: WEEK.id,
      ticket: "TB-102",
      step: "academy",
      exercise: 2,
      points: [2],
      device: "Phone",
    },
    {
      kind: "close",
      id: "b",
      at: new Date(T0 - 1440 * MIN + 40 * MIN).toISOString(),
      stoppedBy: "itself",
      answer: "part",
      countedSeconds: 40 * 60,
    },
    {
      kind: "start",
      id: "c",
      at: new Date(T0 - 300 * MIN).toISOString(),
      week: WEEK.id,
      ticket: "TB-103",
      step: "voice",
      exercise: null,
      points: [1, 2],
      device: "Phone",
    },
    {
      kind: "close",
      id: "c",
      at: new Date(T0 - 290 * MIN).toISOString(),
      stoppedBy: "you",
      answer: "all",
      countedSeconds: 10 * 60,
    },
    {
      kind: "start",
      id: "d",
      at: new Date(T0).toISOString(),
      week: WEEK.id,
      ticket: "TB-101",
      step: "academy",
      exercise: 1,
      points: [1, 2],
      device: "Phone",
    },
  ])
  const tracker = createWorkTracker({
    record,
    homeOpen: () => undefined,
    onHome: none,
    send: (): void => undefined,
    // Back after the cap: the tracker stopped itself, and asks.
    now: (): number => T0 + 150 * MIN,
    newId: (): string => "fit",
    device: "Phone",
    onVisibility: none,
    after: none,
  })
  return {
    tracker,
    spansOf: (): ReturnType<WorkPorts["spansOf"]> => ({
      phone: record.list() ?? [],
      home: [],
      refused: () => false,
    }),
    revision: (): number => 0,
    onChange: none,
  }
}

/**
 * The work tracker (RR26, #3250) as the week's brief shows it: the control,
 * asking on return with its sheet open, and the week's time
 * (`../work-tracker-fit.spec.ts`).
 */
export const WorkTrackerFixture = (): JSX.Element => {
  const [ports] = useState(fixturePorts)
  return (
    <div
      data-work-tracker-page=""
      data-scroll-intent="long-form"
      style={{
        boxSizing: "border-box",
        height: "100%",
        overflowY: "auto",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <WorkTrackerControl tracker={ports.tracker} where={where} />
      <WeekTimeChart ports={ports} week={WEEK} />
    </div>
  )
}
