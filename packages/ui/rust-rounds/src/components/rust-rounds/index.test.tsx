/**
 * The session's screens (#2235): a walk through every screen choosing Skip
 * and Next only, the worked example's rustc results shown as printed, a
 * voice note tapped on and off, heard, redone and let go on the take
 * pattern's parts, and the tutor's page. Every control a screen
 * offers is enabled: nothing waits on a choice. The microphone is the
 * simulated one every screen's tests share, on faked timers.
 */
import { RustRounds } from "@rust-rounds/components/rust-rounds"
import { testPorts } from "@rust-rounds/lib/play/__tests__/ports"
import { keptRounds } from "@rust-rounds/lib/play/store"
import { WORDS } from "@rust-rounds/lib/play/words"
import { INDEXING_01, INDEXING_01_RUNS } from "@rust-rounds/lib/worked-example"
import { inMemoryStorage } from "@some-ui/core-utils"
import { TAKE_WORDS } from "@some-ui/voice-capture"
import { SPEAKING, takeButton as take } from "@some-ui/voice-capture/testing"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
})

afterEach(() => {
  vi.useRealTimers()
})

function expectNothingDisabled(): void {
  for (const button of screen.getAllByRole("button")) {
    expect(button).toBeEnabled()
  }
}

describe("Rust Rounds on the phone", () => {
  it("walks the menu, every card of the worked example and the tutor's page with Skip and Next alone", () => {
    const ports = testPorts()
    render(<RustRounds ports={ports} />)

    // The menu: one tap into cards.
    expect(screen.getByText(WORDS.menuHeading)).toBeInTheDocument()
    // The worked example is the first round, not news from a tutor.
    expect(screen.queryByText(WORDS.newFromTutor("indexing", 4))).toBeNull()
    expectNothingDisabled()
    press(WORDS.start)

    for (const card of INDEXING_01.cards) {
      // Read and choose: the program, the question and its choices.
      expect(
        screen.getByRole("figure", { name: WORDS.program })
      ).toBeInTheDocument()
      if (card.kind !== "refine") {
        expect(screen.getByText(card.ask)).toBeInTheDocument()
        for (const choice of card.choices) {
          expect(
            screen.getByRole("button", { name: choice.pick })
          ).toBeInTheDocument()
        }
      }
      if (card.kind === "variant") {
        expect(
          screen.getByText(WORDS.oneLineChanged(card.hunk.line))
        ).toBeInTheDocument()
      }
      expectNothingDisabled()
      press(WORDS.skipToRustc)

      // See: rustc's recorded result, as printed, and Next.
      const run = INDEXING_01_RUNS[card.id]!
      const printed =
        run.outcome === "compile-error"
          ? run.stderr
          : run.outcome === "panics"
            ? run.stderr
            : run.stdout
      expect(
        screen.getByText(
          (_, element) =>
            element?.tagName === "PRE" && element.textContent === printed
        )
      ).toBeInTheDocument()
      expectNothingDisabled()
      press(WORDS.next)
    }

    // No last card: Next came back round to the first.
    expect(screen.getByText(WORDS.cardTitle("indexing", 1))).toBeInTheDocument()

    // The menu, then the tutor's page, then back to the cards.
    press(WORDS.menu)
    expect(
      screen.getByRole("button", { name: WORDS.continueAt("indexing", 1) })
    ).toBeInTheDocument()
    press(WORDS.tutor)
    expect(
      screen.getByRole("button", { name: WORDS.copyForTutor })
    ).toBeInTheDocument()
    expectNothingDisabled()
    press(WORDS.backToCards)
    expect(screen.getByText(WORDS.cardTitle("indexing", 1))).toBeInTheDocument()
  })

  it("marks rustc's span on the program once its result is shown", () => {
    render(<RustRounds ports={testPorts()} />)
    press(WORDS.start)
    const program = screen.getByRole("figure", { name: WORDS.program })
    expect(program.querySelector("mark[data-code-span]")).toBeNull()
    press(WORDS.skipToRustc)
    expect(
      screen
        .getByRole("figure", { name: WORDS.program })
        .querySelector("mark[data-code-span]")
    ).toHaveTextContent("r")
  })

  it("says a take too short to keep, in the pattern's words", async () => {
    const ports = testPorts()
    ports.notes.mic.script({ ...SPEAKING, open: { kind: "cue" } })
    render(<RustRounds ports={ports} />)
    press(WORDS.start)
    press("Not sure")
    press(TAKE_WORDS.buttonLabel.ready)
    expect(take()).toHaveTextContent(TAKE_WORDS.button.opening)
    await act(async () => {
      ports.notes.mic.answer("open")
      await vi.advanceTimersByTimeAsync(400)
    })
    // Tap to stop, with the time against the cap.
    expect(take()).toHaveTextContent("0:00 / 1:00")
    press(TAKE_WORDS.buttonLabel.recording)
    await settle()
    expect(screen.getByText(TAKE_WORDS.ended.short)).toBeInTheDocument()
  })

  it("says a take tapped off before the microphone was listening (VC2)", async () => {
    const ports = testPorts()
    ports.notes.mic.script({ ...SPEAKING, open: { kind: "cue" } })
    render(<RustRounds ports={ports} />)
    press(WORDS.start)
    press("Not sure")
    press(TAKE_WORDS.buttonLabel.ready)
    press(TAKE_WORDS.buttonLabel.opening)
    await settle()
    expect(screen.getByText(TAKE_WORDS.ended.early)).toBeInTheDocument()
    // Nothing was kept, so the card still offers to talk.
    expect(take()).toHaveAccessibleName(TAKE_WORDS.buttonLabel.ready)
  })

  it("keeps a note, says where, plays it, redoes it and lets it go (D2, D3)", async () => {
    const ports = testPorts()
    render(<RustRounds ports={ports} />)
    press(WORDS.start)
    press("Not sure")
    press(TAKE_WORDS.buttonLabel.ready)
    await settle(3_000)
    press(TAKE_WORDS.buttonLabel.recording)
    await settle()
    expect(screen.getByText(TAKE_WORDS.ended.kept)).toBeInTheDocument()
    expect(
      screen.getByText(new RegExp(TAKE_WORDS.place.phone))
    ).toBeInTheDocument()
    press(TAKE_WORDS.rowLabel(TAKE_WORDS.play, 3_000))
    await settle()
    expect(ports.notes.player.playing()).toBe(1)
    press(TAKE_WORDS.rowLabel(TAKE_WORDS.stop, 3_000))
    expect(ports.notes.player.playing()).toBe(0)

    // Redo: the new take is the card's; the first stays on the phone.
    press(TAKE_WORDS.rowLabel(TAKE_WORDS.redo, 3_000))
    await settle(5_000)
    press(TAKE_WORDS.buttonLabel.recording)
    await settle()
    expect(
      screen.getByRole("button", {
        name: TAKE_WORDS.rowLabel(TAKE_WORDS.play, 5_000),
      })
    ).toBeInTheDocument()
    expect(ports.notes.store.getSnapshot()).toHaveLength(2)

    press(TAKE_WORDS.rowLabel(TAKE_WORDS.letGo, 5_000))
    expect(screen.getByText(TAKE_WORDS.setAside.phone)).toBeInTheDocument()
    expect(take()).toHaveAccessibleName(TAKE_WORDS.buttonLabel.ready)
    expect(ports.notes.store.getSnapshot()).toHaveLength(2)
  })

  it("offers plain Skip on a card with no run of its program on the phone", () => {
    const storage = inMemoryStorage()
    keptRounds(storage).hold({
      rounds: [{ ...INDEXING_01, id: "borrowing-01", concept: "borrowing" }],
      runs: {},
      notes: [],
      notesMissing: false,
    })
    render(<RustRounds ports={testPorts(storage)} />)
    press("borrowing")
    expect(screen.queryByRole("button", { name: WORDS.skipToRustc })).toBeNull()
    press(WORDS.skip)
    expect(screen.getByText(WORDS.noRun)).toBeInTheDocument()
  })

  it("takes a tutor's reply, and says what to send back for one it can't", () => {
    render(<RustRounds ports={testPorts()} />)
    press(WORDS.tutor)
    const reply = screen.getByLabelText(WORDS.replyLabel)
    fireEvent.change(reply, { target: { value: '{"cards": []}' } })
    press(WORDS.takeReply)
    expect(screen.getByText(WORDS.replyRefused)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: WORDS.copyFix })
    ).toBeInTheDocument()

    const round = { ...INDEXING_01, id: "indexing-02" }
    fireEvent.change(reply, {
      target: { value: `\`\`\`json\n${JSON.stringify(round)}\n\`\`\`` },
    })
    press(WORDS.takeReply)
    expect(
      screen.getByText(WORDS.replyTaken("indexing", 4))
    ).toBeInTheDocument()
  })
})
