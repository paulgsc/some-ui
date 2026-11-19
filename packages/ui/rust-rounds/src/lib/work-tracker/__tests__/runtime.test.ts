/**
 * The tracker's runtime (RR26) over fake ports: kept on the phone before it
 * counts, a reload mid-span, the cap, home taking over what is open, and a
 * phone that can't keep anything.
 */
import type { OpenSpan, SpanWhere } from "@rust-rounds/lib/work-tracker"
import { CAP_MS } from "@rust-rounds/lib/work-tracker"
import type {
  EventAtHome,
  SpanEvent,
} from "@rust-rounds/lib/work-tracker/record"
import { workSpans } from "@rust-rounds/lib/work-tracker/record"
import type {
  TrackerPorts,
  WorkTracker,
} from "@rust-rounds/lib/work-tracker/runtime"
import { createWorkTracker } from "@rust-rounds/lib/work-tracker/runtime"
import { inMemoryStorage } from "@some-ui/core-utils"
import type { BundleRecords } from "@some-ui/voice-capture"
import { describe, expect, it } from "vitest"

const T0 = Date.parse("2026-11-19T09:40:00.000Z")
const MIN = 60_000

const where: SpanWhere = {
  week: "2026-w47",
  ticket: "TB-101",
  step: "read",
  exercise: null,
  points: [1, 2, 3],
}

type World = {
  clock: number
  home: OpenSpan | null | undefined
  sends: number
  readonly said: Record<string, EventAtHome>
  readonly wakeUps: Array<{ at: number; run: () => void; gone: boolean }>
  readonly homeListeners: Set<() => void>
  readonly visibility: Set<(hidden: boolean) => void>
}

function setUp(
  record: BundleRecords<SpanEvent>,
  world?: Partial<World>
): {
  world: World
  tracker: WorkTracker
  advance: (ms: number) => void
} {
  const w: World = {
    clock: T0,
    home: undefined,
    sends: 0,
    said: {},
    wakeUps: [],
    homeListeners: new Set(),
    visibility: new Set(),
    ...world,
  }
  let ids = 0
  const ports: TrackerPorts = {
    record,
    homeOpen: () => w.home,
    atHome: (key) => w.said[key] ?? "waiting",
    onHome: (listener) => {
      w.homeListeners.add(listener)
      return () => w.homeListeners.delete(listener)
    },
    send: () => {
      w.sends += 1
    },
    now: () => w.clock,
    newId: () => {
      ids += 1
      return `span-${ids}`
    },
    device: "Pixel 8",
    onVisibility: (listener) => {
      w.visibility.add(listener)
      return () => w.visibility.delete(listener)
    },
    after: (ms, run) => {
      const wake = { at: w.clock + ms, run, gone: false }
      w.wakeUps.push(wake)
      return () => {
        wake.gone = true
      }
    },
  }
  const tracker = createWorkTracker(ports)
  const advance = (ms: number): void => {
    const until = w.clock + ms
    for (;;) {
      const due = w.wakeUps
        .filter((each) => !each.gone && each.at <= until)
        .sort((a, b) => a.at - b.at)[0]
      if (due === undefined) break
      due.gone = true
      w.clock = due.at
      due.run()
    }
    w.clock = until
  }
  return { world: w, tracker, advance }
}

describe("the tracker's runtime", () => {
  it("keeps a start on the phone before it runs, and asks home to send", () => {
    const record = workSpans(inMemoryStorage())
    const { tracker, world } = setUp(record)
    tracker.attach()
    expect(tracker.getSnapshot().state.kind).toBe("idle")
    tracker.start(where)
    expect(tracker.getSnapshot().state.kind).toBe("running")
    expect(record.list()?.map((each) => each.kind)).toEqual(["start"])
    expect(world.sends).toBe(1)
  })

  it("comes back, counts part of it, keeps the close and says so", () => {
    const record = workSpans(inMemoryStorage())
    const { tracker, advance } = setUp(record)
    tracker.attach()
    tracker.start(where)
    advance(50 * MIN)
    tracker.back()
    expect(tracker.getSnapshot().state).toMatchObject({
      kind: "asking",
      stoppedBy: "you",
    })
    tracker.answer({ kind: "part", minutes: 30 })
    const snapshot = tracker.getSnapshot()
    expect(snapshot.state.kind).toBe("idle")
    expect(snapshot.notice).toMatchObject({
      kind: "counted",
      closed: { countedSeconds: 30 * 60, answer: "part" },
    })
    expect(record.list()?.at(-1)).toMatchObject({
      kind: "close",
      countedSeconds: 1800,
      at: new Date(T0 + 50 * MIN).toISOString(),
    })
    tracker.dismiss()
    expect(tracker.getSnapshot().notice).toBeNull()
  })

  it("stops itself at the cap while the screen shows", () => {
    const { tracker, advance } = setUp(workSpans(inMemoryStorage()))
    tracker.attach()
    tracker.start(where)
    advance(CAP_MS + 5 * MIN)
    expect(tracker.getSnapshot().state).toMatchObject({
      kind: "asking",
      stoppedBy: "itself",
      stoppedAt: T0 + CAP_MS,
    })
  })

  it("resumes a span after a reload, from the phone's own record, with no home", () => {
    const storage = inMemoryStorage()
    const first = setUp(workSpans(storage))
    first.tracker.attach()
    first.tracker.start(where)
    const again = setUp(workSpans(storage), { clock: T0 + 3 * CAP_MS })
    // Past its cap by the time the phone opens again: it asks at once.
    expect(again.tracker.getSnapshot().state).toMatchObject({
      kind: "asking",
      span: { id: "span-1", startedAt: T0 },
      stoppedBy: "itself",
    })
    const soon = setUp(workSpans(storage), { clock: T0 + 30 * MIN })
    expect(soon.tracker.getSnapshot().state).toMatchObject({
      kind: "running",
      span: { id: "span-1" },
    })
  })

  it("takes up the span home holds open from another device, and answers it here", () => {
    const record = workSpans(inMemoryStorage())
    const theirs: OpenSpan = {
      id: "theirs",
      where,
      startedAt: T0 - 10 * MIN,
      device: "Tablet",
    }
    const { tracker, world } = setUp(record)
    tracker.attach()
    world.home = theirs
    for (const listener of world.homeListeners) listener()
    expect(tracker.getSnapshot().state).toMatchObject({
      kind: "running",
      span: { id: "theirs" },
    })
    tracker.start(where)
    expect(record.list()).toEqual([])
    tracker.back()
    tracker.answer({ kind: "all" })
    expect(record.list()).toEqual([
      expect.objectContaining({
        kind: "close",
        id: "theirs",
        countedSeconds: 600,
      }),
    ])
  })

  it("starts nothing when the phone can't keep the start", () => {
    const full: BundleRecords<SpanEvent> = { list: () => [], keep: () => null }
    const { tracker, world } = setUp(full)
    tracker.attach()
    tracker.start(where)
    expect(tracker.getSnapshot().state.kind).toBe("idle")
    expect(tracker.getSnapshot().notice).toEqual({ kind: "not-started" })
    expect(world.sends).toBe(0)
  })

  it("asks again when the phone can't keep the answer", () => {
    let room = true
    const storage = inMemoryStorage()
    const real = workSpans(storage)
    const record: BundleRecords<SpanEvent> = {
      list: real.list,
      keep: (change) => (room ? real.keep(change) : null),
    }
    const { tracker, advance } = setUp(record)
    tracker.attach()
    tracker.start(where)
    advance(20 * MIN)
    tracker.back()
    room = false
    tracker.answer({ kind: "all" })
    expect(tracker.getSnapshot().state).toMatchObject({
      kind: "asking",
      notKept: true,
    })
    room = true
    tracker.answer({ kind: "none" })
    expect(tracker.getSnapshot().state.kind).toBe("idle")
  })

  it("never asks again about a span it answered while home still holds it open", () => {
    const record = workSpans(inMemoryStorage())
    const { tracker, world, advance } = setUp(record)
    tracker.attach()
    tracker.start(where)
    advance(20 * MIN)
    tracker.back()
    tracker.answer({ kind: "all" })
    expect(tracker.getSnapshot().state.kind).toBe("idle")
    // A read that began before the close reached home.
    const [start] = record.list() ?? []
    world.home = {
      id: start?.id ?? "",
      where,
      startedAt: T0,
      device: "Pixel 8",
    }
    for (const listener of world.homeListeners) listener()
    expect(tracker.getSnapshot().state.kind).toBe("idle")
    expect(record.list()?.filter((each) => each.kind === "close")).toHaveLength(
      1
    )
  })

  it("stops no earlier than it started, whatever the clock says", () => {
    const record = workSpans(inMemoryStorage())
    const { tracker, world } = setUp(record)
    tracker.attach()
    tracker.start(where)
    world.clock = T0 - 5 * MIN
    tracker.back()
    expect(tracker.getSnapshot().state).toMatchObject({
      kind: "asking",
      stoppedAt: T0,
    })
  })

  it("hears what a run said while no screen showed the tracker", () => {
    const { tracker, world } = setUp(workSpans(inMemoryStorage()))
    const theirs: OpenSpan = {
      id: "theirs",
      where,
      startedAt: T0 - 10 * MIN,
      device: "Tablet",
    }
    world.home = theirs
    tracker.attach()
    expect(tracker.getSnapshot().state).toMatchObject({
      kind: "running",
      span: { id: "theirs" },
    })
  })

  it("keeps a start home hasn't heard over what home last said, on every screen", () => {
    const record = workSpans(inMemoryStorage())
    const { tracker, world } = setUp(record, { home: null })
    const detach = tracker.attach()
    tracker.start(where)
    detach()
    tracker.attach()
    for (const listener of world.homeListeners) listener()
    expect(tracker.getSnapshot().state).toMatchObject({
      kind: "running",
      span: { id: "span-1" },
    })
    // Once home holds it, home's word stands: answered on another device.
    world.said["span-1/start"] = "held"
    for (const listener of world.homeListeners) listener()
    expect(tracker.getSnapshot().state.kind).toBe("idle")
  })
})
