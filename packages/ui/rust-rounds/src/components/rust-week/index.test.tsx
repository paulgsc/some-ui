/**
 * The week's screens (RR13, #2688), on the simulated microphone and the
 * real take pattern: the brief, a ticket with its speak-to points and
 * rustc's recorded result as printed, a take said on it, the look over, and
 * the week sent with the words home heard; the week still open after a send
 * and sent again, and read back once it closed (RR22). Nothing on any
 * screen answers.
 */
import { RustWeek } from "@rust-rounds/components/rust-week"
import type { RustcRun } from "@rust-rounds/lib/formats"
import { QUILLMOSS_WEEK } from "@rust-rounds/lib/sample-week"
import { TALLOWBROOK_WEEK_FILE } from "@rust-rounds/lib/sample-week/tallowbrook"
import { readWeek } from "@rust-rounds/lib/week-check"
import type { RustWeekPorts } from "@rust-rounds/lib/week-play/runtime"
import {
  weekMarks,
  weekPicks,
  weeksSent,
  weekTicks,
} from "@rust-rounds/lib/week-play/store"
import { WEEK_WORDS } from "@rust-rounds/lib/week-play/words"
import type { HeldWeek } from "@rust-rounds/lib/weeks"
import { workSpans } from "@rust-rounds/lib/work-tracker/record"
import type { WorkPorts } from "@rust-rounds/lib/work-tracker/runtime"
import { createWorkTracker } from "@rust-rounds/lib/work-tracker/runtime"
import { TRACKER_WORDS } from "@rust-rounds/lib/work-tracker/words"
import type { KeyedStorage } from "@some-ui/core-utils"
import { inMemoryStorage } from "@some-ui/core-utils"
import { ONE_TAKE } from "@some-ui/voice-capture"
import { simulatedPattern, takeButton } from "@some-ui/voice-capture/testing"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const WORDS = WEEK_WORDS

const press = (name: string | RegExp): void => {
  fireEvent.click(screen.getByRole("button", { name }))
}

const settle = async (ms = 0): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-10T18:00:00Z"))
})

afterEach(() => {
  vi.useRealTimers()
})

const PRINTS: RustcRun = {
  outcome: "prints",
  toolchain: "1.97.0",
  compileStderr: "",
  stdout: "7 ok\n8 late\n",
}

const HELD: HeldWeek = {
  week: QUILLMOSS_WEEK,
  sha256: "a".repeat(64),
  runs: { "QM-311": PRINTS },
  ended: [],
}

function ports(
  storage = inMemoryStorage(),
  simulated = simulatedPattern({
    options: { ...ONE_TAKE, send: "on-confirm" },
  }),
  now: () => number = Date.now,
  homeHolds: RustWeekPorts["homeHolds"] = (): boolean => false
): RustWeekPorts {
  const { pattern, store } = simulated
  return {
    week: HELD,
    takes: {
      pattern,
      takes: { getSnapshot: store.getSnapshot, subscribe: store.subscribe },
      discard: store.discard,
      release: store.release,
    },
    storage,
    home: { reach: () => "near", subscribe: () => (): void => undefined },
    heard: () => Promise.resolve({ kind: "heard", text: "It copies." }),
    homeHolds,
    onHomeHolds: () => (): void => undefined,
    now,
    newId: () => "unused",
    engage: () => undefined,
    perPoint: false,
    verdicts: false,
    onVisibility: (listener) => {
      listener(false)
      return (): void => undefined
    },
  }
}

/** The work tracker's ports over memory, its clock at `at` (RR26). */
function workPorts(at: number): WorkPorts {
  const record = workSpans(inMemoryStorage())
  const none = (): (() => void) => () => undefined
  return {
    tracker: createWorkTracker({
      record,
      homeOpen: () => undefined,
      onHome: none,
      atHome: (): "waiting" => "waiting",
      send: () => undefined,
      now: () => at,
      newId: () => "11111111-1111-4111-8111-111111111111",
      device: "Phone",
      onVisibility: none,
      after: none,
    }),
    spansOf: () => ({
      phone: record.list() ?? [],
      home: [],
      refused: () => false,
    }),
    revision: () => 0,
    onChange: none,
  }
}

describe("a week on the phone (RR13)", () => {
  it("reads the brief, answers a ticket, looks it over and sends the week home", async () => {
    const phone = ports()
    const { unmount } = render(<RustWeek ports={phone} />)
    await settle()

    // The brief: the company, its story, what it has to meet, the tickets.
    expect(screen.getByText(QUILLMOSS_WEEK.company.name)).toBeInTheDocument()
    expect(screen.getByText(QUILLMOSS_WEEK.story)).toBeInTheDocument()
    expect(screen.getByText(WORDS.sla)).toBeInTheDocument()
    const [first, second] = QUILLMOSS_WEEK.tickets
    if (first === undefined || second === undefined) throw new Error("tickets")
    expect(
      screen.getByRole("button", {
        name: new RegExp(`^${WORDS.ticketLabel(first.id, first.title)}`),
      })
    ).toHaveTextContent(WORDS.standing.open)

    // A ticket: its speak-to points, its program, and rustc's result.
    press(new RegExp(`^${WORDS.ticketLabel(first.id, first.title)}`))
    const card = screen.getByRole("region", { name: WORDS.cardOf(1, 3) })
    for (const { question: point } of first.forks) {
      expect(card).toHaveTextContent(point)
    }
    expect(card).toHaveTextContent(WORDS.rustcSilent)
    expect(card).toHaveTextContent("7 ok")
    // A ticket home hasn't run says so, never guessing what rustc does.
    expect(
      document.querySelector(`[data-card="${second.id}"]`)
    ).toHaveTextContent(WORDS.noRunYet)

    // One take on it, tap to talk and tap to stop.
    fireEvent.click(takeButton(card))
    await settle(2_000)
    fireEvent.click(takeButton(card))
    await settle()

    press(WORDS.toReview)
    expect(screen.getByText(WORDS.review.kept)).toBeInTheDocument()
    expect(screen.getAllByText(WORDS.review.notSaid)).toHaveLength(2)
    press(WORDS.send(1))
    await settle()

    // Sent: each ticket with its take, or that it went unanswered; its
    // words show from the next opening, once the note has gone home.
    expect(screen.getByText(WORDS.sent.title(1, 3))).toBeInTheDocument()
    expect(screen.getByText(WORDS.sent.later)).toBeInTheDocument()
    expect(screen.getAllByText(WORDS.sent.notAnswered)).toHaveLength(2)
    unmount()
    // Home has had the send since (RR22).
    render(<RustWeek ports={{ ...phone, homeHolds: () => true }} />)
    await settle()
    // Still open: the brief, with what home has and where each ticket stands.
    expect(
      screen.getByText(/^Home has your send from .*: 1 of 3 answered\.$/)
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: new RegExp(`^${WORDS.ticketLabel(first.id, first.title)}`),
      })
    ).toHaveTextContent(WORDS.standing.sent)
    press(new RegExp(`^${WORDS.ticketLabel(first.id, first.title)}`))
    expect(
      screen.getByRole("region", { name: WORDS.cardOf(1, 3) })
    ).toHaveTextContent("It copies.")
  })

  it("stays open after a send: a skipped ticket answered and the week sent again", async () => {
    const storage = inMemoryStorage()
    const simulated = simulatedPattern({
      options: { ...ONE_TAKE, send: "on-confirm" },
    })
    const sayOn = async (n: number): Promise<void> => {
      const card = screen.getByRole("region", { name: WORDS.cardOf(n, 3) })
      fireEvent.click(takeButton(card))
      await settle(2_000)
      fireEvent.click(takeButton(card))
      await settle()
    }
    const first = render(<RustWeek ports={ports(storage, simulated)} />)
    await settle()
    press(WORDS.toReviewOf(0, 3))
    press(WORDS.back)
    await sayOn(1)
    press(WORDS.toReview)
    press(WORDS.send(1))
    await settle()
    expect(
      screen.getByText(WORDS.sent.again(QUILLMOSS_WEEK))
    ).toBeInTheDocument()
    press(WORDS.backToWeek)
    // Not home's yet: on this phone, until home is in reach.
    expect(
      screen.getByText(/1 of 3 answered, is on this phone\./)
    ).toBeInTheDocument()
    first.unmount()

    render(<RustWeek ports={ports(storage, simulated)} />)
    await settle()
    const [, second] = QUILLMOSS_WEEK.tickets
    if (second === undefined) throw new Error("tickets")
    press(new RegExp(`^${WORDS.ticketLabel(second.id, second.title)}`))
    await sayOn(2)
    press(WORDS.toReview)
    press(WORDS.sendAgain(2))
    await settle()
    expect(screen.getByText(WORDS.sent.title(2, 3))).toBeInTheDocument()
  })

  it("reads back what home had at the deadline, recording and sending nothing", async () => {
    const storage = inMemoryStorage()
    const simulated = simulatedPattern({
      options: { ...ONE_TAKE, send: "on-confirm" },
    })
    const open = render(<RustWeek ports={ports(storage, simulated)} />)
    await settle()
    press(WORDS.toReviewOf(0, 3))
    press(WORDS.back)
    const card = screen.getByRole("region", { name: WORDS.cardOf(1, 3) })
    fireEvent.click(takeButton(card))
    await settle(2_000)
    fireEvent.click(takeButton(card))
    await settle()
    press(WORDS.toReview)
    press(WORDS.send(1))
    await settle()
    open.unmount()

    const after = Date.parse(QUILLMOSS_WEEK.due) + 60_000
    const closedWith = (
      homeSent: RustWeekPorts["homeSent"]
    ): ReturnType<typeof render> =>
      render(
        <RustWeek
          ports={{
            ...ports(
              storage,
              simulated,
              () => after,
              () => false
            ),
            homeSent,
          }}
        />
      )
    let closed = closedWith(() => Promise.resolve({ kind: "none" }))
    await settle()
    // Home's record says it never had it: it didn't count, and it says so.
    expect(screen.getByText(WORDS.sent.title(0, 3))).toBeInTheDocument()
    expect(
      screen.getByText(/didn't reach home before the deadline/)
    ).toBeInTheDocument()
    expect(screen.getAllByText(WORDS.sent.notAnswered)).toHaveLength(3)
    closed.unmount()

    // RR30, the S21's w46: the link's memory lost the send and home's
    // record couldn't be read. Nothing is said of home: no count, no "late".
    const unknown: RustWeekPorts["homeSent"] = () =>
      Promise.resolve({ kind: "unknown" })
    for (const homeSent of [undefined, unknown]) {
      closed = closedWith(homeSent)
      await settle()
      expect(screen.queryByText(/didn't reach home/)).toBeNull()
      expect(screen.queryByText(WORDS.sent.title(0, 3))).toBeNull()
      expect(screen.getByText(/can't say what counted/)).toBeInTheDocument()
      expect(screen.getAllByText(WORDS.sent.notAnswered)).toHaveLength(2)
      closed.unmount()
    }

    // Home holds a send this phone didn't keep: named, nothing else claimed.
    closed = closedWith(() =>
      Promise.resolve({ kind: "sent", at: "2026-11-21T10:00:00.000Z" })
    )
    await settle()
    expect(screen.getByText(/isn't on this phone/)).toHaveTextContent(
      /Your send from .* is shown below/
    )
    expect(screen.queryByText(/didn't reach home/)).toBeNull()
    closed.unmount()

    // The link's memory lost it, and home's record says it holds that send.
    const sentAt = weeksSent(storage).list()?.[0]?.at
    expect(sentAt).toBeDefined()
    closed = closedWith(() =>
      Promise.resolve({ kind: "sent", at: sentAt ?? "" })
    )
    await settle()
    expect(screen.queryByText(/didn't reach home/)).toBeNull()
    expect(screen.getByText(WORDS.sent.title(1, 3))).toBeInTheDocument()
    closed.unmount()

    // A span started before the deadline, still running after it; and
    // home's record and the link's memory agree on the send.
    const running = workPorts(after)
    running.tracker.start({
      week: QUILLMOSS_WEEK.id,
      ticket: QUILLMOSS_WEEK.tickets[0]?.id ?? "",
      step: "read",
      exercise: null,
      points: [1],
    })
    render(
      <RustWeek
        ports={{
          ...ports(
            storage,
            simulated,
            () => after,
            () => true
          ),
          homeSent: () => Promise.resolve({ kind: "sent", at: sentAt ?? "" }),
          work: running,
        }}
      />
    )
    await settle()
    expect(
      screen.getByText(WORDS.closed.title(QUILLMOSS_WEEK))
    ).toBeInTheDocument()
    // The week's time stays to read; nothing starts once it closed, but a
    // span still running is there to stop (RR26).
    expect(screen.getByText(TRACKER_WORDS.week.total(0, 0))).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: TRACKER_WORDS.start })
    ).toBeNull()
    expect(
      screen.getByRole("button", { name: TRACKER_WORDS.back })
    ).toBeInTheDocument()
    expect(screen.queryByText(/didn't reach home/)).toBeNull()
    expect(screen.getByText(WORDS.sent.title(1, 3))).toBeInTheDocument()
    expect(screen.getAllByText(WORDS.sent.notAnswered)).toHaveLength(2)
    for (const ticket of QUILLMOSS_WEEK.tickets) {
      for (const { question: point } of ticket.forks) {
        expect(screen.getAllByText(point).length).toBeGreaterThan(0)
      }
    }
    expect(screen.getByText("It copies.")).toBeInTheDocument()
    // Nothing records, deletes or sends.
    expect(
      screen.queryByRole("button", { name: new RegExp(WORDS.toReview) })
    ).toBeNull()
    expect(screen.queryByRole("button", { name: WORDS.paste.open })).toBeNull()
  })

  it("holds Send until a ticket is said", async () => {
    render(<RustWeek ports={ports()} />)
    await settle()
    press(WORDS.toReviewOf(0, 3))
    expect(screen.getByRole("button", { name: WORDS.send(0) })).toBeDisabled()
    expect(screen.getByText(WORDS.needs.nothing)).toBeInTheDocument()
  })

  it("pastes an error from your own code, keeps it, and says where it is kept", async () => {
    render(<RustWeek ports={ports()} />)
    await settle()
    press(WORDS.paste.open)
    fireEvent.change(screen.getByLabelText(WORDS.paste.label), {
      target: { value: "error[E0382]: borrow of moved value" },
    })
    press(WORDS.paste.keep)
    expect(screen.getByText(WORDS.paste.kept)).toBeInTheDocument()
    // Back on the brief.
    expect(screen.getByText(QUILLMOSS_WEEK.company.name)).toBeInTheDocument()
  })
})

/**
 * RR24 (#3248): a take per speak-to point, as the owner approved it (C680).
 * The point being answered is open with its take; every other point is one
 * line, opened by a tap; a point said shows as said, the others as not; a
 * ticket of more points than fit at a glance shows its filter; and the look
 * over names each point's take.
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

  it("opens one point at a time, records it alone, and names it in the look over", async () => {
    render(
      <RustWeek ports={{ ...ports(), week: withPoints(3), perPoint: true }} />
    )
    await settle()
    const [first] = QUILLMOSS_WEEK.tickets
    if (first === undefined) throw new Error("tickets")
    press(new RegExp(`^${WORDS.ticketLabel(first.id, first.title)}`))
    // The ticket opens on its read (RR25); a /1 week has no academy.
    press(WORDS.flow.read.toVoice)
    expect(screen.getByText(WORDS.points.heading)).toBeInTheDocument()
    // Three points: no filter; point 1 open, 2 and 3 a line each.
    expect(
      screen.queryByRole("navigation", { name: WORDS.points.filter })
    ).toBeNull()
    expect(
      screen.getByRole("button", { name: WORDS.points.open(2, "point 2") })
    ).toHaveTextContent(WORDS.points.notSaid)

    // Point 2 opened by a tap, and said on its own.
    press(WORDS.points.open(2, "point 2"))
    const card = screen.getByRole("region", {
      name: `${first.id} · ${WORDS.flow.steps.voice}`,
    })
    fireEvent.click(takeButton(card))
    await settle(2_000)
    fireEvent.click(takeButton(card))
    await settle()
    press(WORDS.points.open(1, "point 1"))
    expect(
      screen.getByRole("button", { name: WORDS.points.open(2, "point 2") })
    ).toHaveTextContent(WORDS.points.said)
    expect(screen.getByText(WORDS.points.count(1, 3))).toBeInTheDocument()

    press(WORDS.toReview)
    expect(
      screen.getByText(WORDS.points.label(first.id, 2, "point 2"))
    ).toBeInTheDocument()
    // A ticket's own take, never said, is not listed beside its points.
    expect(
      screen.queryByText(WORDS.ticketLabel(first.id, first.title))
    ).toBeNull()
  })

  it("shows the filter once a ticket has more points than fit at a glance", async () => {
    render(
      <RustWeek ports={{ ...ports(), week: withPoints(8), perPoint: true }} />
    )
    await settle()
    const [first] = QUILLMOSS_WEEK.tickets
    if (first === undefined) throw new Error("tickets")
    press(new RegExp(`^${WORDS.ticketLabel(first.id, first.title)}`))
    press(WORDS.flow.read.toVoice)
    const filter = screen.getByRole("navigation", {
      name: WORDS.points.filter,
    })
    expect(filter).toHaveTextContent(`${WORDS.points.unsaid}8`)
    fireEvent.click(screen.getByRole("button", { name: /^Said/ }))
    // Nothing said yet, but the open point stays: its take is never hidden.
    expect(
      [...document.querySelectorAll("[data-point]")].map((li) =>
        li.getAttribute("data-point")
      )
    ).toEqual(["1"])
  })
})

/**
 * RR25 (#3249) and RR29 (#3257), as the owner approved the flow (C690): a
 * /2 ticket read with its constraints and forks, its academy worked and an
 * exercise ticked, then a pick at a fork beside its take. Each mark, tick
 * and pick is kept, and the week opens again where it was left.
 */
describe("a ticket's flow (RR25, RR29)", () => {
  const read = readWeek(TALLOWBROOK_WEEK_FILE)
  if (!read.ok) throw new Error("the /2 sample reads")
  const FLOWED: HeldWeek = { ...HELD, week: read.week, runs: {} }
  const FLOW = WORDS.flow
  const [first, second] = read.week.tickets
  if (first === undefined || second === undefined) throw new Error("tickets")

  it("reads, works the academy, picks at a fork, and keeps each step", async () => {
    vi.setSystemTime(new Date("2026-11-19T18:00:00Z"))
    const storage = inMemoryStorage()
    const phone = { ...ports(storage), week: FLOWED, perPoint: true }
    const { unmount } = render(<RustWeek ports={phone} />)
    await settle()
    press(new RegExp(`^${WORDS.ticketLabel(first.id, first.title)}`))

    // Read: the constraints by id, each fork's options, one recommended.
    const readPage = screen.getByRole("region", {
      name: `${first.id} · ${FLOW.steps.read}`,
    })
    expect(readPage).toHaveTextContent("S3")
    expect(readPage).toHaveTextContent("F2")
    expect(readPage).toHaveTextContent(FLOW.read.forkOf(1, 2))
    expect(readPage).toHaveTextContent(FLOW.read.notAll(3))
    expect(within(readPage).getAllByText(FLOW.read.recommended)).toHaveLength(2)
    press(FLOW.read.toAcademy)

    // Academy: three exercises, none worked; one opens, is ticked, closes.
    const academy = screen.getByRole("region", {
      name: `${first.id} · ${FLOW.steps.academy}`,
    })
    expect(within(academy).getAllByText(FLOW.academy.notYet)).toHaveLength(3)
    expect(
      screen.getByRole("button", { name: FLOW.academy.skip })
    ).toBeInTheDocument()
    press(new RegExp(first.academy[0]?.title ?? "none"))
    expect(screen.getByText(FLOW.exercise.tests(1, "B"))).toBeInTheDocument()
    press(FLOW.exercise.tick)
    expect(
      screen.getByRole("button", { name: FLOW.exercise.ticked })
    ).toBeDisabled()
    press(FLOW.exercise.back)
    expect(screen.getAllByText(FLOW.academy.atDesk)).toHaveLength(1)
    press(FLOW.academy.onward)

    // Voice: fork 1 picked; fork 2, left alone, goes with the recommended.
    const voice = screen.getByRole("region", {
      name: `${first.id} · ${FLOW.steps.voice}`,
    })
    const fork1 = within(voice).getByRole("group", {
      name: first.forks[0]?.question ?? "",
    })
    fireEvent.click(within(fork1).getAllByRole("button")[1]!)
    expect(within(fork1).getAllByRole("button")[1]).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(
      within(voice).getByRole("button", {
        name: WORDS.points.open(2, first.forks[1]?.question ?? ""),
      })
    ).toHaveTextContent(`${FLOW.voice.byDefault("A")} · ${FLOW.voice.notSaid}`)
    expect(voice).toHaveTextContent(FLOW.voice.mine(1, 2))

    // Kept, every one: read and academy gone through, the tick, the pick.
    expect(
      weekMarks(storage)
        .list()
        ?.map(({ step, mark }) => [step, mark])
    ).toEqual([
      ["read", "done"],
      ["academy", "done"],
    ])
    expect(weekTicks(storage).list()).toHaveLength(1)
    expect(
      weekPicks(storage)
        .list()
        ?.map(({ pick }) => pick)
    ).toEqual([{ kind: "option", option: "B" }])

    // Read and the academy gone through: ticked beside their names.
    const row = screen.getByRole("navigation", { name: FLOW.stepsOf(first.id) })
    expect(
      within(row).getByRole("button", {
        name: new RegExp(`^${FLOW.steps.read}\\s*, ${FLOW.doneSaid}$`),
      })
    ).toBeInTheDocument()

    // On to the next ticket: this voice is marked skipped, unsaid.
    press(FLOW.voice.next(second.id))
    expect(
      screen.getByRole("region", { name: `${second.id} · ${FLOW.steps.read}` })
    ).toBeInTheDocument()
    unmount()

    // Opened again, the brief's ticket opens where it was left.
    render(<RustWeek ports={phone} />)
    await settle()
    press(new RegExp(`^${WORDS.ticketLabel(first.id, first.title)}`))
    expect(
      screen.getByRole("region", { name: `${first.id} · ${FLOW.steps.read}` })
    ).toBeInTheDocument()
    // Every step of it marked, so it opens on its first; Next turns the line.
    press(/^Next page of steps/)
    expect(
      screen.getByRole("region", {
        name: `${first.id} · ${FLOW.steps.academy}`,
      })
    ).toBeInTheDocument()
  })

  it("says a mark it couldn't keep over the look over it opens", async () => {
    vi.setSystemTime(new Date("2026-11-19T18:00:00Z"))
    const kept = inMemoryStorage()
    let refuse = false
    const storage: KeyedStorage = {
      ...kept,
      getItem: (key) => kept.getItem(key),
      removeItem: (key) => kept.removeItem(key),
      setItem: (key, value) => {
        if (refuse && key.endsWith("week-marks")) throw new Error("full")
        kept.setItem(key, value)
      },
    }
    render(
      <RustWeek ports={{ ...ports(), storage, week: FLOWED, perPoint: true }} />
    )
    await settle()
    press(new RegExp(`^${WORDS.ticketLabel(first.id, first.title)}`))
    press(FLOW.read.skip)
    refuse = true
    press(WORDS.toReview)
    // The look over opens, and the mark that wasn't kept is said over it.
    expect(screen.getByText(WORDS.review.kept)).toBeInTheDocument()
    expect(screen.getByText(FLOW.notKept)).toBeInTheDocument()
  })

  it("passes the academy by from the read, and says so in the step row", async () => {
    vi.setSystemTime(new Date("2026-11-19T18:00:00Z"))
    const storage = inMemoryStorage()
    render(
      <RustWeek ports={{ ...ports(storage), week: FLOWED, perPoint: true }} />
    )
    await settle()
    press(new RegExp(`^${WORDS.ticketLabel(second.id, second.title)}`))
    press(FLOW.read.skip)
    expect(
      screen.getByRole("region", { name: `${second.id} · ${FLOW.steps.voice}` })
    ).toBeInTheDocument()
    const row = screen.getByRole("navigation", {
      name: FLOW.stepsOf(second.id),
    })
    expect(row).toHaveTextContent(FLOW.standing.skipped)
    expect(
      weekMarks(storage)
        .list()
        ?.map(({ step, mark }) => [step, mark])
    ).toEqual([
      ["read", "done"],
      ["academy", "skipped"],
    ])
  })
})
