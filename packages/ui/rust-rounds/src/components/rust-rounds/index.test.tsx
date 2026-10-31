/**
 * The session's screens (#2235): a walk through every screen choosing Skip
 * and Next only, the worked example's rustc results shown as printed, the
 * microphone held and let go, and the tutor's page. Every control a screen
 * offers is enabled: nothing waits on a choice.
 */
import { RustRounds } from "@rust-rounds/components/rust-rounds"
import { fakePorts } from "@rust-rounds/lib/play/__tests__/fakes"
import { WORDS } from "@rust-rounds/lib/play/words"
import { INDEXING_01, INDEXING_01_RUNS } from "@rust-rounds/lib/worked-example"
import { inMemoryStorage } from "@some-ui/core-utils"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

const press = (name: string | RegExp): void => {
  fireEvent.click(screen.getByRole("button", { name }))
}

function expectNothingDisabled(): void {
  for (const button of screen.getAllByRole("button")) {
    expect(button).toBeEnabled()
  }
}

describe("Rust Rounds on the phone", () => {
  it("walks the menu, every card of the worked example and the tutor's page with Skip and Next alone", () => {
    const ports = fakePorts()
    render(<RustRounds ports={ports} />)

    // The menu: one tap into cards.
    expect(screen.getByText(WORDS.menuHeading)).toBeInTheDocument()
    expect(
      screen.getByText(WORDS.newFromTutor("indexing", 4))
    ).toBeInTheDocument()
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
    render(<RustRounds ports={fakePorts()} />)
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

  it("asks the picked choice's sentence, and keeps what is said while held", () => {
    const ports = fakePorts()
    render(<RustRounds ports={ports} />)
    press(WORDS.start)
    const [card] = INDEXING_01.cards
    if (card?.kind !== "read") throw new Error("the example opens on a read")
    const choice = card.choices[0]!
    press(choice.pick)
    expect(screen.getByText(choice.say)).toBeInTheDocument()

    const hold = screen.getByRole("button", { name: WORDS.holdToSpeak })
    fireEvent.pointerDown(hold)
    expect(
      screen.getByRole("button", { name: WORDS.listening })
    ).toBeInTheDocument()
    fireEvent.pointerUp(hold)
    act(() => ports.notes.land("note-1"))
    expect(screen.getByText(WORDS.noteKept)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: WORDS.holdToSpeak })).toBeNull()
    // Skip is still there with a note kept.
    expectNothingDisabled()
    press(WORDS.skipToRustc)
    press(WORDS.next)
  })

  it("says a take too short to keep, in the person's words", () => {
    const ports = fakePorts()
    render(<RustRounds ports={ports} />)
    press(WORDS.start)
    press("Not sure")
    const hold = screen.getByRole("button", { name: WORDS.holdToSpeak })
    fireEvent.pointerDown(hold)
    fireEvent.pointerUp(hold)
    act(() => ports.notes.land(null))
    expect(screen.getByRole("status")).toHaveTextContent(WORDS.takeEnded.short)
  })

  it("reopens on the card left, as far into it as it was", () => {
    const storage = inMemoryStorage()
    const first = render(<RustRounds ports={fakePorts(storage)} />)
    press(WORDS.start)
    press(WORDS.next)
    press(WORDS.skipToRustc)
    first.unmount()

    render(<RustRounds ports={fakePorts(storage)} />)
    expect(screen.getByText(WORDS.cardTitle("indexing", 2))).toBeInTheDocument()
    expect(screen.getByText(WORDS.printed)).toBeInTheDocument()
  })

  it("takes a tutor's reply, and says what to send back for one it can't", () => {
    render(<RustRounds ports={fakePorts()} />)
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
