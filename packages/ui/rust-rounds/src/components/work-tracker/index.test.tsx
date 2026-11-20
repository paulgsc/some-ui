/**
 * The tracker on screen (RR26): start, come back, the ask with its three
 * answers, what was counted said over the screen, and the week's time as
 * bars or a table.
 */
import { TALLOWBROOK_WEEK_FILE } from "@rust-rounds/lib/sample-week/tallowbrook"
import { readWeek } from "@rust-rounds/lib/week-check"
import type { SpanWhere } from "@rust-rounds/lib/work-tracker"
import { workSpans } from "@rust-rounds/lib/work-tracker/record"
import type { WorkPorts } from "@rust-rounds/lib/work-tracker/runtime"
import { createWorkTracker } from "@rust-rounds/lib/work-tracker/runtime"
import { TRACKER_WORDS } from "@rust-rounds/lib/work-tracker/words"
import { inMemoryStorage } from "@some-ui/core-utils"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  firstPart,
  Tracker,
  WeekTimeChart,
  WorkProvider,
  WorkTrackerControl,
} from "./index"

const T0 = Date.parse("2026-11-19T17:40:00.000Z")
const MIN = 60_000
const where: SpanWhere = {
  week: "2026-w47",
  ticket: "TB-101",
  step: "read",
  exercise: null,
  points: [1, 2],
}
const week = { id: "2026-w47", tickets: [{ id: "TB-101" }, { id: "TB-102" }] }

/** A stop that stops nothing. */
const none = (): (() => void) => () => undefined

function setUp(): { ports: WorkPorts; advance: (ms: number) => void } {
  const storage = inMemoryStorage()
  const record = workSpans(storage)
  let clock = T0
  let revision = 0
  const changed = new Set<() => void>()
  const tracker = createWorkTracker({
    record,
    homeOpen: () => undefined,
    onHome: none,
    atHome: (): "waiting" => "waiting",
    send: () => {
      revision += 1
      for (const listener of changed) listener()
    },
    now: () => clock,
    newId: () => "11111111-1111-4111-8111-111111111111",
    device: "Phone",
    onVisibility: none,
    after: none,
  })
  return {
    ports: {
      tracker,
      spansOf: () => ({
        phone: record.list() ?? [],
        home: [],
        refused: () => false,
      }),
      revision: () => revision,
      onChange: (listener) => {
        changed.add(listener)
        return () => changed.delete(listener)
      },
    },
    advance: (ms): void => {
      clock += ms
    },
  }
}

describe("the work tracker on screen", () => {
  it("counts a span toward what its step shows: an exercise's forks, else every point (RR25)", () => {
    const read = readWeek(TALLOWBROOK_WEEK_FILE)
    if (!read.ok) throw new Error("the /2 sample reads")
    const ticket = read.week.tickets[0]
    const exercise = ticket?.academy[2]
    if (ticket === undefined || exercise === undefined) {
      throw new Error("TB-101's third exercise")
    }
    const { ports } = setUp()
    const { rerender } = render(
      <WorkProvider work={ports}>
        <Tracker week={read.week} ticket={ticket} step="academy" exercise={3} />
      </WorkProvider>
    )
    fireEvent.click(screen.getByRole("button", { name: TRACKER_WORDS.start }))
    // Kept as started: the exercise and the forks it builds toward.
    expect(ports.spansOf("2026-w47").phone).toMatchObject([
      {
        kind: "start",
        ticket: "TB-101",
        step: "academy",
        exercise: 3,
        points: exercise.forks,
      },
    ])
    rerender(
      <WorkProvider work={ports}>
        <Tracker week={read.week} ticket={ticket} step="voice" />
      </WorkProvider>
    )
    expect(
      screen.getByRole("button", { name: TRACKER_WORDS.back })
    ).toBeTruthy()
  })

  it("starts, comes back, counts part of it and says so over the screen", () => {
    const { ports, advance } = setUp()
    render(
      <>
        <WorkTrackerControl tracker={ports.tracker} where={where} />
        <WeekTimeChart ports={ports} week={week} />
      </>
    )
    expect(screen.getByText(TRACKER_WORDS.week.total(0, 0))).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: TRACKER_WORDS.start }))
    expect(screen.getByText(/Working since 09:40 · 0:00/)).toBeTruthy()

    advance(100 * MIN)
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: TRACKER_WORDS.back }))
    })
    expect(screen.getByText(TRACKER_WORDS.sheet.title)).toBeTruthy()
    // 100 minutes: the first part offered is 1 h 30 m; one step less is 1 h 15 m.
    fireEvent.click(
      screen.getByRole("button", { name: TRACKER_WORDS.sheet.less })
    )
    fireEvent.click(
      screen.getByRole("button", { name: TRACKER_WORDS.sheet.part(75) })
    )
    expect(
      screen.getByText(
        TRACKER_WORDS.counted("TB-101", 75 * 60, T0, T0 + 100 * MIN)
      )
    ).toBeTruthy()
    expect(screen.getByText(TRACKER_WORDS.week.total(75 * 60, 1))).toBeTruthy()
    expect(
      screen.getByRole("img", {
        name: TRACKER_WORDS.week.bar("TB-101", "read", 75 * 60),
      })
    ).toBeTruthy()
    fireEvent.click(
      screen.getByRole("button", { name: TRACKER_WORDS.week.asTable })
    )
    expect(screen.getByRole("table")).toBeTruthy()
  })

  it("counts nothing when the owner says none of it was work", () => {
    const { ports, advance } = setUp()
    render(<WorkTrackerControl tracker={ports.tracker} where={where} />)
    fireEvent.click(screen.getByRole("button", { name: TRACKER_WORDS.start }))
    advance(10 * MIN)
    fireEvent.click(screen.getByRole("button", { name: TRACKER_WORDS.back }))
    // Under 15 minutes: no part to offer.
    expect(screen.queryByText(TRACKER_WORDS.sheet.partLabel)).toBeNull()
    fireEvent.click(
      screen.getByRole("button", { name: TRACKER_WORDS.sheet.none })
    )
    expect(
      screen.getByText(TRACKER_WORDS.counted("TB-101", 0, T0, T0 + 10 * MIN))
    ).toBeTruthy()
  })

  it("offers nothing to start where nothing starts", () => {
    const { ports } = setUp()
    render(<WorkTrackerControl tracker={ports.tracker} where={null} />)
    expect(
      screen.queryByRole("button", { name: TRACKER_WORDS.start })
    ).toBeNull()
  })

  it("offers part of it in 15-minute steps short of the span", () => {
    expect(firstPart(14)).toBe(0)
    expect(firstPart(15)).toBe(15)
    expect(firstPart(100)).toBe(90)
    expect(firstPart(120)).toBe(105)
  })
})
