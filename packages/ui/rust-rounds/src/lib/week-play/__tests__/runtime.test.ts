/**
 * A week on the phone (RR13, #2688), end to end on the simulated microphone
 * and the real take pattern: a take per ticket waits on the phone, named by
 * its week and ticket, until the week is sent together; a week sent opens on
 * its brief, still open (RR22), and asks home once for the words heard in
 * each take; it is said again and sent again, keeping every take and send;
 * a week past its deadline records and sends nothing.
 */
import { QUILLMOSS_WEEK } from "@rust-rounds/lib/sample-week"
import type { RustWeek } from "@rust-rounds/lib/week-play/runtime"
import { createRustWeek } from "@rust-rounds/lib/week-play/runtime"
import type { WeekSent } from "@rust-rounds/lib/week-play/spec"
import { weekAtHome } from "@rust-rounds/lib/week-play/spec"
import { weekMarks, weeksSent } from "@rust-rounds/lib/week-play/store"
import type { HeldWeek } from "@rust-rounds/lib/weeks"
import type { KeyedStorage } from "@some-ui/core-utils"
import { inMemoryStorage } from "@some-ui/core-utils"
import type { EngagementEvent } from "@some-ui/engagement"
import type { BundleTakes, HeardAnswer } from "@some-ui/voice-capture"
import { ONE_TAKE } from "@some-ui/voice-capture"
import type { SimulatedPattern } from "@some-ui/voice-capture/testing"
import { simulatedPattern } from "@some-ui/voice-capture/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-10T18:00:00Z"))
})

afterEach(() => {
  vi.useRealTimers()
})

const pass = async (ms = 0): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms)
}

const HELD: HeldWeek = {
  week: QUILLMOSS_WEEK,
  sha256: "a".repeat(64),
  runs: {},
  ended: [],
}

type Phone = {
  readonly week: RustWeek
  readonly simulated: SimulatedPattern
  readonly release: ReturnType<typeof vi.fn>
  readonly heard: ReturnType<typeof vi.fn>
  readonly detach: () => void
  /** What the week told the engagement sink, in order. */
  readonly engaged: Array<EngagementEvent>
  /** The link says it heard more of what home holds. */
  readonly homeHeard: () => void
}

function phone(
  storage: KeyedStorage,
  simulated: SimulatedPattern,
  over: {
    now?: () => number
    heard?: (take: string) => Promise<HeardAnswer>
    homeHolds?: (sent: WeekSent) => boolean
    perPoint?: boolean
    held?: HeldWeek
  } = {}
): Phone {
  const perPoint = over.perPoint ?? false
  const { pattern, store } = simulated
  const takes: BundleTakes = {
    pattern,
    takes: { getSnapshot: store.getSnapshot, subscribe: store.subscribe },
    discard: store.discard,
    release: store.release,
  }
  const release = vi.fn(takes.release)
  const heard = vi.fn(
    over.heard ??
      ((): Promise<HeardAnswer> => Promise.resolve({ kind: "notYet" }))
  )
  const engaged: Array<EngagementEvent> = []
  const held = new Set<() => void>()
  const week = createRustWeek({
    week: over.held ?? HELD,
    takes: { ...takes, release },
    storage,
    home: { reach: () => "near", subscribe: () => (): void => undefined },
    heard,
    homeHolds: over.homeHolds ?? ((): boolean => false),
    onHomeHolds: (listener) => {
      held.add(listener)
      return (): void => {
        held.delete(listener)
      }
    },
    now: over.now ?? Date.now,
    newId: () => "unused",
    engage: (event) => engaged.push(event),
    perPoint,
    onVisibility: (listener) => {
      listener(false)
      return (): void => undefined
    },
  })
  const detach = week.attach()
  const homeHeard = (): void => {
    for (const listener of held) listener()
  }
  return { week, simulated, release, heard, detach, engaged, homeHeard }
}

const onConfirm = (): SimulatedPattern =>
  simulatedPattern({ options: { ...ONE_TAKE, send: "on-confirm" } })

/** Says a take on `ticket`'s card: a tap, talk, a tap. */
async function say(on: Phone, ticket: string): Promise<void> {
  on.week.bundle.dispatch({ type: "tap", item: ticket })
  await pass(2_000)
  on.week.bundle.dispatch({ type: "tap", item: ticket })
  await pass()
}

describe("a week on the phone (RR13)", () => {
  it("keeps each take waiting, named by its week and ticket, until the week goes together", async () => {
    const storage = inMemoryStorage()
    const on = phone(storage, onConfirm())
    expect(on.week.bundle.getSnapshot().screen).toBe("intro")
    on.week.bundle.dispatch({ type: "go", index: 0 })
    await say(on, "QM-311")
    await say(on, "QM-313")
    const takes = on.simulated.store.getSnapshot()
    expect(takes.map((take) => take.answers).sort()).toEqual([
      "2026-w46:QM-311",
      "2026-w46:QM-313",
    ])
    expect(on.release).not.toHaveBeenCalled()

    on.week.bundle.dispatch({ type: "review" })
    on.week.bundle.dispatch({ type: "send" })

    const [sent] = weeksSent(storage).list() ?? []
    expect(sent).toMatchObject({
      week: "2026-w46",
      passed: ["QM-312"],
    })
    expect(sent?.answers.map(({ ticket }) => ticket)).toEqual([
      "QM-311",
      "QM-313",
    ])
    expect(on.release).toHaveBeenCalledTimes(1)
    expect(on.week.bundle.getSnapshot().screen).toBe("sent")
  })

  it("opens a week sent on its brief, beside what was sent, and asks home once an opening for each take's words", async () => {
    const storage = inMemoryStorage()
    const simulated = onConfirm()
    const first = phone(storage, simulated)
    first.week.bundle.dispatch({ type: "go", index: 0 })
    await say(first, "QM-311")
    first.week.bundle.dispatch({ type: "review" })
    first.week.bundle.dispatch({ type: "send" })
    await pass()
    first.detach()
    // Asked nothing in the opening Send happened in: the note hasn't gone.
    expect(first.heard).not.toHaveBeenCalled()
    const [take] = simulated.store.getSnapshot()

    const again = phone(storage, simulated, {
      heard: () => Promise.resolve({ kind: "heard", text: "It copies." }),
    })
    await pass()
    expect(again.week.bundle.getSnapshot()).toMatchObject({
      screen: "intro",
      sent: { week: "2026-w46" },
    })
    expect(again.heard).toHaveBeenCalledTimes(1)
    expect(again.week.heard.getSnapshot()).toEqual({
      [take?.id ?? ""]: { kind: "heard", text: "It copies." },
    })
    again.detach()

    // Kept on the phone: asked no more.
    const third = phone(storage, simulated)
    await pass()
    expect(third.heard).not.toHaveBeenCalled()
    expect(third.week.heard.getSnapshot()).toEqual({
      [take?.id ?? ""]: { kind: "heard", text: "It copies." },
    })
  })

  it("asks for each take's words one after another, as home's link runs them", async () => {
    const storage = inMemoryStorage()
    const simulated = onConfirm()
    const first = phone(storage, simulated)
    first.week.bundle.dispatch({ type: "go", index: 0 })
    await say(first, "QM-311")
    await say(first, "QM-312")
    first.week.bundle.dispatch({ type: "review" })
    first.week.bundle.dispatch({ type: "send" })
    await pass()
    first.detach()
    // The link: one request at a time, any other answered busy.
    let out = false
    const heard = async (): Promise<HeardAnswer> => {
      if (out) return { kind: "busy" }
      out = true
      await new Promise((done) => {
        setTimeout(done, 10)
      })
      out = false
      return { kind: "heard", text: "Words." }
    }
    const again = phone(storage, simulated, { heard })
    await pass(100)
    expect(
      Object.values(again.week.heard.getSnapshot()).map((each) => each?.kind)
    ).toEqual(["heard", "heard"])
  })

  it("stays open after a send: said again, keeping the take sent, a ticket passed over answered, and sent again (RR22)", async () => {
    const storage = inMemoryStorage()
    const simulated = onConfirm()
    const first = phone(storage, simulated)
    first.week.bundle.dispatch({ type: "go", index: 0 })
    await say(first, "QM-311")
    first.week.bundle.dispatch({ type: "review" })
    first.week.bundle.dispatch({ type: "send" })
    await pass()
    first.detach()
    const [sentTake] = simulated.store.getSnapshot()

    const on = phone(storage, simulated)
    await pass()
    expect(on.week.bundle.getSnapshot().screen).toBe("intro")
    on.week.bundle.dispatch({ type: "go", index: 0 })
    await say(on, "QM-311")
    await say(on, "QM-312")
    on.week.bundle.dispatch({ type: "review" })
    on.week.bundle.dispatch({ type: "send" })
    await pass()

    const kept = weeksSent(storage).list() ?? []
    expect(kept).toHaveLength(2)
    expect(kept[1]?.answers.map(({ ticket }) => ticket)).toEqual([
      "QM-311",
      "QM-312",
    ])
    expect(kept[1]?.passed).toEqual(["QM-313"])
    expect(kept[1]?.answers[0]?.take).not.toBe(sentTake?.id)
    // The take sent first is kept, set apart as an earlier one.
    const takes = simulated.store.getSnapshot()
    expect(takes.find((take) => take.id === sentTake?.id)).toMatchObject({
      standing: "earlier",
    })
    expect(takes).toHaveLength(3)
    expect(takes.every((take) => take.waits !== true)).toBe(true)
  })

  it("records and sends nothing past the deadline, and keeps the takes on the phone", async () => {
    const due = Date.parse(QUILLMOSS_WEEK.due)
    let now = due - 60_000
    const on = phone(inMemoryStorage(), onConfirm(), { now: () => now })
    on.week.bundle.dispatch({ type: "go", index: 0 })
    await say(on, "QM-311")
    now = due + 60_000
    on.week.bundle.dispatch({ type: "review" })
    expect(on.week.bundle.getSnapshot().screen).toBe("cards")
    expect(on.week.machine.missing(on.week.bundle.getSnapshot())).toBe("closed")
    on.week.bundle.dispatch({ type: "send" })
    on.week.bundle.dispatch({ type: "swipe", to: "next" })
    await say(on, "QM-312")
    expect(on.release).not.toHaveBeenCalled()
    expect(on.simulated.store.getSnapshot().map((take) => take.waits)).toEqual([
      true,
    ])
  })
})

describe("the week's openings (RR14)", () => {
  it("tells each ticket opened and left, by its place in the week, never its key (RR14)", async () => {
    const on = phone(inMemoryStorage(), onConfirm())
    on.week.bundle.dispatch({ type: "go", index: 0 })
    await pass(5_000)
    on.week.bundle.dispatch({ type: "swipe", to: "next" })
    await pass(5_000)
    on.week.bundle.dispatch({ type: "back" })
    on.detach()
    expect(
      on.engaged.map((event) => [
        event.kind,
        event.kind === "left" ? event.place : null,
      ])
    ).toEqual([
      ["taken", null],
      ["left", "ticket-1"],
      ["taken", null],
      ["left", "ticket-2"],
    ])
  })

  it("tells a ticket opened once, whichever of its steps or points is on screen (RR24, RR25)", async () => {
    const on = phone(inMemoryStorage(), onConfirm(), { perPoint: true })
    const items = on.week.machine.spec.items
    const flow = on.week.flow
    const [first] = QUILLMOSS_WEEK.tickets
    if (first === undefined || flow === null) {
      throw new Error("tickets, and a flow")
    }
    // The flow moves the takes (RR25): its read, then its voice's points.
    flow.dispatch({ type: "openTicket", ticket: first.id })
    await pass(5_000)
    flow.dispatch({ type: "go", index: 1 })
    on.week.bundle.dispatch({
      type: "go",
      index: items.indexOf(`${first.id}:2`),
    })
    await pass(5_000)
    flow.dispatch({ type: "go", index: 2 })
    await pass(5_000)
    on.week.bundle.dispatch({ type: "back" })
    on.detach()
    expect(
      on.engaged.map((event) => [
        event.kind,
        event.kind === "left" ? event.place : null,
      ])
    ).toEqual([
      ["taken", null],
      ["left", "ticket-1"],
      ["taken", null],
      ["left", "ticket-2"],
    ])
  })
})

describe("what home has of a week (RR22, C56)", () => {
  const send = (week: string, at: string): WeekSent => ({
    week,
    at,
    answers: [],
    passed: [],
  })
  const first = send("2026-w46", "2026-11-12T20:00:00.000Z")
  const second = send("2026-w46", "2026-11-13T20:00:00-08:00")
  const other = send("2026-w47", "2026-11-20T20:00:00.000Z")

  it("is the latest send home holds, by instant, beside the latest made", () => {
    const kept = [second, other, first]
    expect(weekAtHome(kept, { id: "2026-w46" }, () => true)).toEqual({
      holds: second,
      last: second,
    })
    expect(
      weekAtHome(kept, { id: "2026-w46" }, (sent) => sent === first)
    ).toEqual({ holds: first, last: second })
    expect(weekAtHome(kept, { id: "2026-w48" }, () => true)).toEqual({
      holds: null,
      last: null,
    })
  })

  it("reads again once a Send lands, from the link's word", async () => {
    const storage = inMemoryStorage()
    const on = phone(storage, onConfirm(), { homeHolds: () => true })
    expect(on.week.atHome.getSnapshot()).toEqual({ holds: null, last: null })
    on.week.bundle.dispatch({ type: "go", index: 0 })
    await say(on, "QM-311")
    on.week.bundle.dispatch({ type: "review" })
    on.week.bundle.dispatch({ type: "send" })
    const [sent] = weeksSent(storage).list() ?? []
    expect(on.week.atHome.getSnapshot()).toEqual({ holds: sent, last: sent })
  })

  it("reads again when the link hears home has a send, with no new Send", async () => {
    const storage = inMemoryStorage()
    let homeHas = false
    const on = phone(storage, onConfirm(), { homeHolds: () => homeHas })
    on.week.bundle.dispatch({ type: "go", index: 0 })
    await say(on, "QM-311")
    on.week.bundle.dispatch({ type: "review" })
    on.week.bundle.dispatch({ type: "send" })
    const [sent] = weeksSent(storage).list() ?? []
    expect(on.week.atHome.getSnapshot().holds).toBeNull()
    homeHas = true
    on.homeHeard()
    expect(on.week.atHome.getSnapshot().holds).toEqual(sent)
  })

  it("asks home for the words of the send it holds, not only the last made", async () => {
    const storage = inMemoryStorage()
    const simulated = onConfirm()
    const first = phone(storage, simulated)
    first.week.bundle.dispatch({ type: "go", index: 0 })
    await say(first, "QM-311")
    first.week.bundle.dispatch({ type: "review" })
    first.week.bundle.dispatch({ type: "send" })
    await pass()
    first.week.bundle.dispatch({ type: "back" })
    first.week.bundle.dispatch({ type: "go", index: 0 })
    await say(first, "QM-311")
    first.week.bundle.dispatch({ type: "review" })
    first.week.bundle.dispatch({ type: "send" })
    await pass()
    first.detach()
    const [held, last] = weeksSent(storage).list() ?? []
    const again = phone(storage, simulated, {
      homeHolds: (sent) => sent.at === held?.at,
    })
    await pass()
    const asked: Array<unknown> = again.heard.mock.calls.map(
      (call): unknown => call[0]
    )
    expect(asked).toContain(held?.answers[0]?.take)
    expect(asked).toContain(last?.answers[0]?.take)
  })
})

/**
 * RR24 (#3248): a take per speak-to point. Across a ticket of k points, each
 * point records, is redone and is let go on its own, and the others stay as
 * they were; the week sent names each point's take by its point, read from
 * the take's `ref` (`<week>:<ticket>:<n>`), never by splitting one.
 */
describe("a take per point (RR24)", () => {
  const withPoints = (k: number): HeldWeek => ({
    ...HELD,
    week: {
      ...QUILLMOSS_WEEK,
      tickets: QUILLMOSS_WEEK.tickets.map((ticket, i) =>
        i === 0
          ? {
              ...ticket,
              forks: Array.from({ length: k }, (_, n) => ({
                question: `point ${n + 1}`,
                options: [],
              })),
            }
          : ticket
      ),
    },
  })

  it.each([2, 3, 8])(
    "records, redoes and lets go each of %i points on its own",
    async (k) => {
      const storage = inMemoryStorage()
      const on = phone(storage, onConfirm(), {
        perPoint: true,
        held: withPoints(k),
      })
      const ticket = QUILLMOSS_WEEK.tickets[0]!.id
      const items = on.week.machine.spec.items.filter((item) =>
        item.startsWith(`${ticket}:`)
      )
      expect(items).toEqual(
        Array.from({ length: k }, (_, n) => `${ticket}:${n + 1}`)
      )
      on.week.bundle.dispatch({ type: "go", index: 0 })
      for (const item of items) await say(on, item)
      const answers = (): Array<string> =>
        on.simulated.store
          .getSnapshot()
          .map((take) => take.answers)
          .sort()
      const lines = items.map((item) => `2026-w46:${item}`).sort()
      expect(answers()).toEqual(lines)
      const idOf = (line: string): string | undefined =>
        on.simulated.store
          .getSnapshot()
          .filter((take) => take.answers === line)
          .at(-1)?.id

      // Redo point 2: a new take of point 2 only; every other point keeps its own.
      const before = items.map((item) => idOf(`2026-w46:${item}`))
      await say(on, items[1]!)
      const after = items.map((item) => idOf(`2026-w46:${item}`))
      expect(after.filter((id, n) => id !== before[n])).toHaveLength(1)
      expect(after[1]).not.toBe(before[1])

      // Let point 1 go: deleted before Send (it never left), the others stay.
      on.week.bundle.dispatch({ type: "askDelete", item: items[0]! })
      on.week.bundle.dispatch({ type: "confirmed" })
      await pass()
      expect(idOf(`2026-w46:${items[0]!}`)).toBeUndefined()
      for (const n of items.keys())
        if (n > 0) expect(idOf(`2026-w46:${items[n]!}`)).toBe(after[n])

      on.week.bundle.dispatch({ type: "review" })
      on.week.bundle.dispatch({ type: "send" })
      const [sent] = weeksSent(storage).list() ?? []
      const points = (sent?.answers ?? [])
        .filter((answer) => answer.ticket === ticket)
        .map((answer) => answer.point)
      expect(points).toEqual(Array.from({ length: k - 1 }, (_, n) => n + 2))
      expect(sent?.passed).not.toContain(ticket)
    }
  )

  it("keeps a take of the whole ticket, sent before points, as its ticket's", async () => {
    const storage = inMemoryStorage()
    const on = phone(storage, onConfirm(), {
      perPoint: true,
      held: withPoints(3),
    })
    const ticket = QUILLMOSS_WEEK.tickets[0]!.id
    on.week.bundle.dispatch({ type: "go", index: 0 })
    // A take of the whole ticket, as a phone before RR24 recorded one.
    await say(on, ticket)
    await say(on, `${ticket}:2`)
    on.week.bundle.dispatch({ type: "review" })
    on.week.bundle.dispatch({ type: "send" })
    const [sent] = weeksSent(storage).list() ?? []
    expect(
      sent?.answers
        .filter((answer) => answer.ticket === ticket)
        .map((answer) => answer.point ?? "whole")
    ).toEqual(["whole", 2])
  })
})

/**
 * The flow and the takes stay on one ticket (RR25), and a take is never
 * moved: the flow moves the takes; a take asked from the look over brings
 * the flow to its ticket's voice; Back from the look over, or a take's
 * Later, brings the takes back to where the flow is.
 */
describe("the flow and the takes on one ticket", () => {
  const [first = "", second = ""] = QUILLMOSS_WEEK.tickets.map(({ id }) => id)
  const onScreen = (on: Phone): { flow: string; takes: string | undefined } => {
    const flow = on.week.flow?.getSnapshot()
    const step = flow?.steps[flow.at]
    const state = on.week.bundle.getSnapshot()
    return {
      flow: `${step?.ticket ?? ""} ${step?.step ?? ""}`,
      takes: on.week.machine.spec.items[state.index],
    }
  }
  /** The first ticket gone through: the week opens on the second's read. */
  const openedOnSecond = (): KeyedStorage => {
    const storage = inMemoryStorage()
    weekMarks(storage).keep(() =>
      (["read", "voice"] as const).map((step) => ({
        week: QUILLMOSS_WEEK.id,
        ticket: first,
        step,
        mark: "done" as const,
        at: "2026-11-10T09:00:00Z",
      }))
    )
    return storage
  }

  it("brings the takes to the flow's ticket, back from a look over opened on the brief", async () => {
    const on = phone(openedOnSecond(), onConfirm(), { perPoint: true })
    await pass()
    expect(onScreen(on).flow).toBe(`${second} read`)
    on.week.bundle.dispatch({ type: "review" })
    on.week.bundle.dispatch({ type: "back" })
    expect(on.week.bundle.getSnapshot().screen).toBe("cards")
    expect(onScreen(on)).toEqual({
      flow: `${second} read`,
      takes: `${second}:1`,
    })
    on.detach()
  })

  it("records a take asked from the look over where it was asked, the flow at its voice", async () => {
    for (const [from, item] of [
      [first, `${second}:2`],
      [second, `${second}:2`],
    ] as const) {
      const on = phone(inMemoryStorage(), onConfirm(), { perPoint: true })
      // On the flow's read, from the brief.
      on.week.flow?.dispatch({ type: "openTicket", ticket: from })
      on.week.bundle.dispatch({ type: "review" })
      on.week.bundle.dispatch({ type: "tap", item })
      await pass(2_000)
      expect(on.week.bundle.getSnapshot().busy).toBe(true)
      expect(onScreen(on)).toEqual({ flow: `${second} voice`, takes: item })
      on.week.bundle.dispatch({ type: "tap", item })
      await pass()
      on.detach()
    }
  })

  it("keeps the takes on the flow's ticket after a Later at its last point", () => {
    const on = phone(inMemoryStorage(), onConfirm(), { perPoint: true })
    const last = `${first}:${QUILLMOSS_WEEK.tickets[0]?.forks.length ?? 0}`
    on.week.flow?.dispatch({ type: "openTicket", ticket: first })
    on.week.flow?.dispatch({ type: "go", index: 1 })
    on.week.bundle.dispatch({
      type: "go",
      index: on.week.machine.spec.items.indexOf(last),
    })
    on.week.bundle.dispatch({ type: "later", item: last })
    expect(onScreen(on)).toEqual({ flow: `${first} voice`, takes: last })
    on.detach()
  })
})
