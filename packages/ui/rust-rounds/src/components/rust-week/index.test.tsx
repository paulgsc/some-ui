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
import type { RustWeekPorts } from "@rust-rounds/lib/week-play/runtime"
import { WEEK_WORDS } from "@rust-rounds/lib/week-play/words"
import type { HeldWeek } from "@rust-rounds/lib/weeks"
import { inMemoryStorage } from "@some-ui/core-utils"
import { ONE_TAKE } from "@some-ui/voice-capture"
import { simulatedPattern, takeButton } from "@some-ui/voice-capture/testing"
import { act, fireEvent, render, screen } from "@testing-library/react"
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
    onVisibility: (listener) => {
      listener(false)
      return (): void => undefined
    },
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
    for (const point of first.speakTo) {
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
    const closed = render(
      <RustWeek
        ports={ports(
          storage,
          simulated,
          () => after,
          () => false
        )}
      />
    )
    await settle()
    // Home never had it: it didn't count, and it says so.
    expect(screen.getByText(WORDS.sent.title(0, 3))).toBeInTheDocument()
    expect(
      screen.getByText(/didn't reach home before the deadline/)
    ).toBeInTheDocument()
    expect(screen.getAllByText(WORDS.sent.notAnswered)).toHaveLength(3)
    closed.unmount()

    render(
      <RustWeek
        ports={ports(
          storage,
          simulated,
          () => after,
          () => true
        )}
      />
    )
    await settle()
    expect(
      screen.getByText(WORDS.closed.title(QUILLMOSS_WEEK))
    ).toBeInTheDocument()
    expect(screen.queryByText(/didn't reach home/)).toBeNull()
    expect(screen.getByText(WORDS.sent.title(1, 3))).toBeInTheDocument()
    expect(screen.getAllByText(WORDS.sent.notAnswered)).toHaveLength(2)
    for (const ticket of QUILLMOSS_WEEK.tickets) {
      for (const point of ticket.speakTo) {
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
