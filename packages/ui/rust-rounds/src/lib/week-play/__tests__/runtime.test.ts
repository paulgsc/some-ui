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
import { createRustWeek, currentWeek } from "@rust-rounds/lib/week-play/runtime"
import { weeksSent } from "@rust-rounds/lib/week-play/store"
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
}

function phone(
  storage: KeyedStorage,
  simulated: SimulatedPattern,
  over: {
    now?: () => number
    heard?: (take: string) => Promise<HeardAnswer>
  } = {}
): Phone {
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
  const week = createRustWeek({
    week: HELD,
    takes: { ...takes, release },
    storage,
    home: { reach: () => "near", subscribe: () => (): void => undefined },
    heard,
    now: over.now ?? Date.now,
    newId: () => "unused",
    engage: (event) => engaged.push(event),
    onVisibility: (listener) => {
      listener(false)
      return (): void => undefined
    },
  })
  const detach = week.attach()
  return { week, simulated, release, heard, detach, engaged }
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
    // The owner's phone on 2026-w46: one take of three sent.
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
    on.week.bundle.dispatch({ type: "review" })
    expect(on.week.machine.missing(on.week.bundle.getSnapshot())).toBe(
      "unchanged"
    )
    on.week.bundle.dispatch({ type: "go", index: 1 })
    on.week.bundle.dispatch({ type: "back" })
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
    expect(on.week.bundle.getSnapshot().screen).toBe("sent")
    on.week.bundle.dispatch({ type: "back" })
    expect(on.week.bundle.getSnapshot().screen).toBe("intro")
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

describe("the week open now", () => {
  const week = (id: string, opens: string): HeldWeek => ({
    ...HELD,
    week: { ...QUILLMOSS_WEEK, id, opens },
  })
  const w46 = week("2026-w46", "2026-11-09T00:00:00-08:00")
  const w47 = week("2026-w47", "2026-11-16T00:00:00-08:00")

  it("is the newest that has opened, or the first held before any has", () => {
    expect(currentWeek([w46, w47], Date.parse("2026-11-12T00:00:00Z"))).toBe(
      w46
    )
    expect(currentWeek([w46, w47], Date.parse("2026-11-17T00:00:00Z"))).toBe(
      w47
    )
    expect(currentWeek([w46, w47], Date.parse("2026-11-01T00:00:00Z"))).toBe(
      w46
    )
    expect(currentWeek([], Date.now())).toBeNull()
  })

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
})
