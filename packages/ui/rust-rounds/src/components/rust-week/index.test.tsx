/**
 * The week's screens (RR13, #2688), on the simulated microphone and the
 * real take pattern: the brief, a ticket with its speak-to points and
 * rustc's recorded result as printed, a take said on it, the look over, and
 * the week sent with the words home heard. Nothing on any screen answers.
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

function ports(storage = inMemoryStorage()): RustWeekPorts {
  const { pattern, store } = simulatedPattern({
    options: { ...ONE_TAKE, send: "on-confirm" },
  })
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
    now: Date.now,
    newId: () => "unused",
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
    render(<RustWeek ports={phone} />)
    await settle()
    expect(screen.getByText("It copies.")).toBeInTheDocument()
  })

  it("holds Send until a ticket is said", async () => {
    render(<RustWeek ports={ports()} />)
    await settle()
    press(WORDS.toReviewOf(0, 3))
    expect(screen.getByRole("button", { name: WORDS.send(0) })).toBeDisabled()
    expect(screen.getByText(WORDS.needs.nothing)).toBeInTheDocument()
  })
})
