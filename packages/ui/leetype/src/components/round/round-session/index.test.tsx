import type { ComponentProps } from "react"
import { act } from "react"
import { RoundSession } from "@leetype/components/round/round-session"
import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import type { Ledger } from "@leetype/lib/leetype/ledger"
import { EMPTY_LEDGER, recordObservations } from "@leetype/lib/leetype/ledger"
import type { Observation } from "@leetype/lib/leetype/ledger/observation"
import { observationsOfCommitment } from "@leetype/lib/leetype/ledger/observation"
import { LEDGER_STATE_COPY } from "@leetype/lib/leetype/ledger/state"
import type { LedgerStore } from "@leetype/lib/leetype/ledger/store"
import type { RoundNote } from "@leetype/lib/leetype/notes"
import type { Dictation, Listening } from "@leetype/lib/leetype/notes/dictation"
import type { NoteStore } from "@leetype/lib/leetype/notes/store"
import type { PastedRoundStore } from "@leetype/lib/leetype/pasted-round"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { serializeRound } from "@leetype/lib/leetype/round-export"
import { BUNDLED_ROUND_RUNS } from "@leetype/lib/leetype/round-runs/bundled"
import { BOOST_CAP, WEIGHT_FLOOR } from "@leetype/lib/leetype/round-sampler"
import type { Round } from "@leetype/types/authored-round"
import type { DiffSetMember } from "@leetype/types/round"
import type { ForeignOutcome } from "@some-ui/intent-kit"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const COUNT_PRESENT = AUTHORED_ROUNDS[0]!

function memoryStore(initial: Round | null = null): PastedRoundStore {
  let held = initial
  return {
    get: (): Round | null => held,
    set: (round): void => {
      held = round
    },
    clear: (): void => {
      held = null
    },
  }
}

/** A ledger store in memory, starting from `initial` (empty: a cleared store). */
function memoryLedgerStore(
  initial: Ledger = EMPTY_LEDGER
): LedgerStore & { held: () => Ledger } {
  let held = initial
  return {
    get: (): Ledger => held,
    set: (ledger): void => {
      held = ledger
    },
    held: (): Ledger => held,
  }
}

/** The evidence ring filed under a register id read off the screen. */
function ringOf(ledger: Ledger, id: string): ReadonlyArray<Observation> {
  return (
    Object.entries(ledger.entries).find(([key]) => key === id)?.[1]?.ring ?? []
  )
}

/** The corpus member whose hunk a rewrite card shows. */
function memberOfCard(card: HTMLElement): DiffSetMember {
  const text = card.textContent.replace(/\s+/g, "")
  const member = AUTHORED_ROUNDS.flatMap((round) =>
    round.diffOptions.map((option) => option.member)
  ).find((candidate) => {
    // Line by line: the card puts a gutter between lines.
    const lines = (kind: "addition" | "deletion"): Array<string> =>
      candidate.hunk.segments
        .filter((segment) => segment.kind === kind)
        .flatMap((segment) => segment.text.split("\n"))
        .map((line) => line.replace(/\s+/g, ""))
        .filter((line) => line.length > 0)
    const added = lines("addition")
    return (added.length > 0 ? added : lines("deletion")).every((line) =>
      text.includes(line)
    )
  })
  if (member === undefined) throw new Error("no corpus member matches card")
  return member
}

/** Renders a session on `COUNT_PRESENT` with seed 3 and an empty pasted store, overridden by `props`. */
function renderRound(
  props: Partial<ComponentProps<typeof RoundSession>> = {}
): ReturnType<typeof render> {
  return render(
    <RoundSession
      rounds={[COUNT_PRESENT]}
      sessionSeed={3}
      pastedStore={memoryStore()}
      {...props}
    />
  )
}

/** Runs `body` with the session clock faked, restoring real timers after. */
function withFakeClock(body: () => void): void {
  vi.useFakeTimers({
    toFake: ["setInterval", "clearInterval", "performance"],
  })
  try {
    body()
  } finally {
    vi.useRealTimers()
  }
}

/** Lets the session timer run out (sessionDurationMs 1000). */
function endSession(): void {
  act(() => {
    vi.advanceTimersByTime(1250)
  })
}

const CW_P6_TITLE = new RegExp(PROPOSITION_REGISTER["CW-P6"].title)

/** In `COUNT_PRESENT`: choose the binary_search rewrite and commit CW-P6, its answer. */
function answerCountPresentCorrectly(): void {
  goTo("Rewrites")
  chooseRewriteContaining("binary_search")
  fireEvent.click(screen.getByRole("button", { name: CW_P6_TITLE }))
}

/** The first proposition option whose title is (or, when `matches` is false, is not) `title`. */
function propositionOption(title: string, matches: boolean): HTMLElement {
  return screen
    .getAllByRole("button")
    .find(
      (button) =>
        Object.values(PROPOSITION_REGISTER).some(({ title: known }) =>
          button.textContent.includes(known)
        ) && button.textContent.includes(title) === matches
    )!
}

/** Presses the switcher's Next until `label` is the artifact in view. */
function goTo(label: string): void {
  for (let step = 0; step < 6; step += 1) {
    if (screen.queryByText(label, { selector: "p, span" })) {
      const visible = screen
        .getAllByText(label)
        .some((node) => node.closest("[hidden],[inert]") === null)
      if (visible) return
    }
    fireEvent.click(
      screen.getByRole("button", { name: "Round: next artifact" })
    )
  }
}

/** The rewrite card whose code contains `text`, and its choose button. */
function chooseRewriteContaining(text: string): void {
  const cards = screen.getAllByRole("region", { name: /^Rewrite / })
  const card = cards.find((node) => node.textContent.includes(text))
  if (card === undefined) throw new Error(`no rewrite contains ${text}`)
  fireEvent.click(within(card).getByRole("button", { name: /^Choose rewrite/ }))
}

describe("RoundSession", () => {
  beforeEach(() => {
    // The default ledger store is `localStorage`; no test inherits another's.
    localStorage.clear()
  })

  it("plays a round end to end: the admissible rewrite, its proposition, the verdict, the next round", () => {
    renderRound()
    expect(screen.getByText("Round 1")).toBeInTheDocument()
    // Prop. 8.1: the header counts rounds played, never a fraction of a
    // corpus. (The switcher's own "k of n" is a position among artifacts.)
    expect(screen.queryByText(/Round \d+ (of|\/)/)).not.toBeInTheDocument()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()

    answerCountPresentCorrectly()
    expect(screen.getByText("Correct")).toBeInTheDocument()
    expect(
      screen.getByText("This rewrite fits the budget at the new bounds.")
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Next round" }))
    expect(screen.getByText("Round 2")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Next round" })
    ).not.toBeInTheDocument()
  })

  it("asks the rescue question when the chosen rewrite does not fit but a bound change would", () => {
    renderRound()
    goTo("Rewrites")
    chooseRewriteContaining("break;")
    // Any commitment moves the cycle on (Ax. 9.1); abstain is a real row.
    fireEvent.click(screen.getAllByRole("button", { name: /Not sure/ })[0]!)
    expect(
      screen.getByText(/Under which bounds would it fit\?/)
    ).toBeInTheDocument()
    // Progress is unconditional: a wrong or abstained pair can move on.
    expect(screen.getByRole("button", { name: "Next round" })).toBeEnabled()
  })

  it("plays the learner's own round first, from the session store", () => {
    const own: Round = { ...COUNT_PRESENT, id: "my-own-round" }
    renderRound({
      rounds: [AUTHORED_ROUNDS[1]!],
      pastedStore: memoryStore(own),
    })
    expect(screen.getByText("Your round")).toBeInTheDocument()
  })

  it("takes a pasted round through the generate panel and plays it next", () => {
    const store = memoryStore()
    const set = vi.spyOn(store, "set")
    renderRound({ rounds: [AUTHORED_ROUNDS[1]!], pastedStore: store })
    fireEvent.click(screen.getByRole("button", { name: /Make your own/ }))
    fireEvent.change(screen.getByLabelText("Your model's reply"), {
      target: { value: `\`\`\`json\n${serializeRound(COUNT_PRESENT)}\`\`\`` },
    })
    fireEvent.click(screen.getByRole("button", { name: "Check the round" }))
    fireEvent.click(screen.getByRole("button", { name: /Play it/ }))

    expect(set).toHaveBeenCalledWith(COUNT_PRESENT)
    expect(screen.getByText("Your round")).toBeInTheDocument()
  })

  it("starts a fresh session on Restart: round 1 again, not where the last one stopped", () => {
    withFakeClock(() => {
      renderRound({ sessionDurationMs: 1000 })
      answerCountPresentCorrectly()
      fireEvent.click(screen.getByRole("button", { name: "Next round" }))
      expect(screen.getByText("Round 2")).toBeInTheDocument()

      endSession()
      expect(screen.getByText("1 round played")).toBeInTheDocument()
      fireEvent.click(screen.getByRole("button", { name: "Restart" }))
      expect(screen.getByText("Round 1")).toBeInTheDocument()
    })
  })

  it("keeps a committed answer committed across opening and cancelling the generator", () => {
    renderRound()
    answerCountPresentCorrectly()

    fireEvent.click(screen.getByRole("button", { name: /Make your own/ }))
    fireEvent.click(screen.getByRole("button", { name: "Back to the rounds" }))

    // Still one-shot: the option rows stay disabled after the round is shown again.
    expect(screen.getByRole("button", { name: CW_P6_TITLE })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Next round" })).toBeEnabled()
  })

  it("files each (d, p) commitment into the ledger: three cases, the wrong choice named", () => {
    const ledgerStore = memoryLedgerStore()
    renderRound({ ledgerStore })
    goTo("Rewrites")
    chooseRewriteContaining("binary_search")
    const wrong = propositionOption(PROPOSITION_REGISTER["CW-P6"].title, false)
    const chosen = Object.values(PROPOSITION_REGISTER).find(({ title }) =>
      wrong.textContent.includes(title)
    )!.id
    fireEvent.click(wrong)

    const witness = ledgerStore.held().entries["CW-P6"]?.ring[0]
    expect(witness).toMatchObject({
      outcome: { kind: "incorrect", chosen },
      propositionId: "CW-P6",
      role: "witness",
      roundId: COUNT_PRESENT.id,
    })
    expect(witness?.rewriteKey).toMatch(/^rw:/)
    // Filed under the option they chose too, as the distractor it was.
    expect(ringOf(ledgerStore.held(), chosen)[0]?.role).toBe("distractor")
  })

  it("keeps what another tab stored since mount when it files a commitment", () => {
    const ledgerStore = memoryLedgerStore()
    renderRound({ ledgerStore })
    // Another tab answers a card after this one read the store.
    const elsewhere = observationsOfCommitment({
      answerId: "CW-P16",
      presented: ["CW-P16", "CW-P8"],
      commitment: { kind: "choice", id: "CW-P16" },
      roundId: "another-tab",
      rewriteKey: "rw:another-tab",
      sessionId: "another-tab",
      at: 1,
    })
    ledgerStore.set(recordObservations(EMPTY_LEDGER, elsewhere))

    answerCountPresentCorrectly()

    const roundsOf = (id: PropositionId): Array<string> =>
      (ledgerStore.held().entries[id]?.ring ?? []).map(({ roundId }) => roundId)
    expect(roundsOf("CW-P16")).toContain("another-tab")
    expect(roundsOf("CW-P6")).toContain(COUNT_PRESENT.id)
  })

  it("never files the learner's own round: its key was in hand (Ax. 9.2)", () => {
    const ledgerStore = memoryLedgerStore()
    renderRound({
      rounds: [AUTHORED_ROUNDS[1]!],
      pastedStore: memoryStore({ ...COUNT_PRESENT, id: "my-own-round" }),
      ledgerStore,
    })
    answerCountPresentCorrectly()
    expect(ledgerStore.held()).toEqual(EMPTY_LEDGER)
  })

  it("from a cleared store, answering every round wrongly, reaches and reveals every round (Thm. 9.1, Thm. 7.2)", () => {
    // The sampler's reach bound (see `round-sampler`'s tests): with five
    // rounds each draw reaches an unreached one with probability at least
    // 1/33, so this many draws miss one with probability under 1e-6.
    const n = AUTHORED_ROUNDS.length
    const p =
      WEIGHT_FLOOR / (WEIGHT_FLOOR + (n - 1) * (WEIGHT_FLOOR + BOOST_CAP))
    const bound = Math.ceil(Math.log(n / 1e-6) / -Math.log(1 - p))
    const ledgerStore = memoryLedgerStore()
    renderRound({ rounds: AUTHORED_ROUNDS, sessionSeed: 11, ledgerStore })
    const reached = new Set<string>()
    for (let draw = 0; draw < bound && reached.size < n; draw += 1) {
      // Every artifact is there before any answer: nothing is gated.
      for (const label of ["Program", "Bounds", "Budget", "Rewrites"]) {
        goTo(label)
        expect(
          screen
            .getAllByText(label)
            .some((node) => node.closest("[hidden],[inert]") === null)
        ).toBe(true)
      }
      const card = screen.getAllByRole("region", { name: /^Rewrite / })[0]!
      const answer = PROPOSITION_REGISTER[memberOfCard(card).propositionId]
      fireEvent.click(
        within(card).getByRole("button", { name: /^Choose rewrite/ })
      )
      fireEvent.click(propositionOption(answer.title, false))

      // Wrong, and everything is revealed anyway: the answer's statement,
      // the next state, and the way on (Ax. 9.1).
      expect(screen.getByText(answer.statement)).toBeInTheDocument()
      const witness = ringOf(ledgerStore.held(), answer.id).at(-1)
      expect(witness?.outcome.kind).toBe("incorrect")
      reached.add(witness!.roundId)
      fireEvent.click(screen.getByRole("button", { name: "Next round" }))
    }
    expect([...reached].sort()).toEqual(
      AUTHORED_ROUNDS.map((round) => round.id).sort()
    )
    // Up to `bound` whole draws, each visiting four tabs before answering:
    // about 2 s here and 5.3 s on CI's runner, past vitest's 5 s default.
  }, 15_000)

  it("says recognized after one correct selection, and never mastery (Cor. 10.1)", () => {
    withFakeClock(() => {
      renderRound({ sessionDurationMs: 1000, ledgerStore: memoryLedgerStore() })
      answerCountPresentCorrectly()
      endSession()
      const ledger = screen.getByRole("region", { name: "Your ledger" })
      const row = within(ledger)
        .getByText(PROPOSITION_REGISTER["CW-P6"].title)
        .closest("li")!
      expect(row).toHaveTextContent(LEDGER_STATE_COPY.recognized)
      expect(row).not.toHaveTextContent(/Demonstrated:/)
      expect(document.body.textContent).not.toMatch(/master|%|streak|level/i)
    })
  })

  it("skips a round that fails the authored-round checks rather than playing it", () => {
    const broken: Round = {
      ...COUNT_PRESENT,
      id: "broken",
      graph: { kind: "work", cost: 1 },
    }
    renderRound({ rounds: [broken] })
    expect(
      screen.getByText(
        "No rounds are available right now. You can make your own."
      )
    ).toBeInTheDocument()
  })
})

/** A note store in memory, kept in insertion order. */
function memoryNoteStore(): NoteStore & { notes: Map<string, RoundNote> } {
  const notes = new Map<string, RoundNote>()
  return {
    notes,
    list: (): Array<RoundNote> => [...notes.values()].reverse(),
    put: (note): void => {
      notes.set(note.id, note)
    },
    remove: (id): void => {
      notes.delete(id)
    },
  }
}

/** A phone recognizer that hears `words` once its utterance is stopped. */
function hearing(words: string): Dictation {
  return {
    recognizer: "phone",
    listen(onHeard): Listening {
      let finish: (text: string) => void = () => undefined
      const outcome = new Promise<ForeignOutcome<string>>((resolve) => {
        finish = (value): void => resolve({ status: "succeeded", value })
      })
      onHeard(words)
      return {
        outcome,
        stop: (): void => finish(words),
        cancel: () => undefined,
      }
    },
  }
}

/** A phone whose recognizer cannot start, as its port reports it. */
const NO_RECOGNIZER: Dictation = {
  recognizer: "phone",
  listen: (): Listening => ({
    outcome: Promise.resolve({
      status: "failed",
      error: {
        kind: "unavailable",
        retryable: false,
        summary: "This phone has no speech recognizer this app can use.",
        cause: new Error("Speech recognition service is not available."),
      },
    }),
    stop: () => undefined,
    cancel: () => undefined,
  }),
}

describe("RoundSession — margin notes (canon Rem. 3.7)", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("saves a note on whatever is showing with one tap, and files nothing in the ledger", () => {
    const notes = memoryNoteStore()
    const ledger = memoryLedgerStore()
    renderRound({ ledgerStore: ledger, noteStore: notes, dictation: null })
    goTo("Rewrites")
    chooseRewriteContaining("binary_search")
    // Choosing a rewrite brings the question into view; go back to it.
    fireEvent.click(screen.getByRole("tab", { name: "Rewrites" }))
    fireEvent.click(screen.getByRole("button", { name: "Note on Rewrites" }))
    fireEvent.click(
      screen.getByRole("button", { name: "Not sure what it's asking" })
    )

    const [note] = [...notes.notes.values()]
    expect(note).toMatchObject({
      kind: "unclear",
      text: "",
      anchor: {
        roundId: COUNT_PRESENT.id,
        own: false,
        artifact: "diffSet",
        committed: false,
      },
    })
    expect(note?.anchor.picked).not.toBeNull()
    // Prop. 3.4: a note is not evidence.
    expect(ledger.held()).toEqual(EMPTY_LEDGER)

    fireEvent.change(screen.getByLabelText("Add words to the note"), {
      target: { value: "which bound is new? " },
    })
    expect(notes.notes.get(note!.id)?.text).toBe("which bound is new?")
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(
      screen.queryByLabelText("Add words to the note")
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Note on Rewrites" }))
    fireEvent.click(screen.getByRole("button", { name: "I don't know this" }))
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    expect(notes.notes.size).toBe(1)
  })

  it("offers speech where there is a recognizer, says whose it is, and keeps the words", async () => {
    const notes = memoryNoteStore()
    renderRound({
      noteStore: notes,
      dictation: hearing("the budget is per test case"),
    })
    fireEvent.click(screen.getByRole("button", { name: "Note on Program" }))
    fireEvent.click(screen.getByRole("button", { name: "Just a thought" }))
    expect(screen.getByText(/Your phone's speech service/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Speak" }))
    expect(screen.getByLabelText("Add words to the note")).toHaveValue(
      "the budget is per test case"
    )
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done" }))
      await Promise.resolve()
    })
    expect([...notes.notes.values()][0]).toMatchObject({
      text: "the budget is per test case",
      spoken: true,
      anchor: { artifact: "algorithm" },
    })
  })

  it("says why on a phone whose recognizer cannot start, and stops offering the microphone", async () => {
    renderRound({ noteStore: memoryNoteStore(), dictation: NO_RECOGNIZER })
    fireEvent.click(screen.getByRole("button", { name: "Note on Program" }))
    fireEvent.click(screen.getByRole("button", { name: "Just a thought" }))
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Speak" }))
      await Promise.resolve()
    })
    expect(
      within(
        screen.getByRole("region", { name: "Note on the program" })
      ).getByText(
        "This phone has no speech recognizer this app can use. You can type instead."
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Speak" })
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText("Add words to the note")).toHaveAttribute(
      "placeholder",
      "Add words, if you like"
    )
  })

  it("keeps Make your own unavailable while a spoken note is still being turned into text", async () => {
    const notes = memoryNoteStore()
    renderRound({ noteStore: notes, dictation: hearing("which bound grew") })
    fireEvent.click(screen.getByRole("button", { name: "Note on Program" }))
    fireEvent.click(screen.getByRole("button", { name: "I don't know this" }))
    fireEvent.click(screen.getByRole("button", { name: "Speak" }))
    // The generator would hide Stop and Done, and read the notes too early.
    expect(screen.getByRole("button", { name: /Make your own/ })).toBeDisabled()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done" }))
      await Promise.resolve()
    })
    expect([...notes.notes.values()][0]).toMatchObject({
      text: "which bound grew",
      spoken: true,
    })
    expect(screen.getByRole("button", { name: /Make your own/ })).toBeEnabled()
  })

  it("puts focus back on the Note button after Done, and leaves it alone when a control elsewhere closed the note", () => {
    renderRound({ noteStore: memoryNoteStore(), dictation: null })
    const press = (element: HTMLElement): void => {
      fireEvent.pointerDown(element)
      fireEvent.click(element)
    }
    press(screen.getByRole("button", { name: "Note on Program" }))
    press(screen.getByRole("button", { name: "Just a thought" }))
    // The chip is gone; focus is on the panel, not lost and not the textarea.
    expect(document.activeElement).toBe(
      screen.getByRole("region", { name: "Note on the program" })
    )
    press(screen.getByRole("button", { name: "Done" }))
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Note on Program" })
    )

    // A close caused from outside the panel (the generator's own button):
    // focus stays where it is.
    screen.getByRole("button", { name: "Note on Program" }).blur()
    press(screen.getByRole("button", { name: "Note on Program" }))
    press(screen.getByRole("button", { name: "I don't know this" }))
    press(screen.getByRole("button", { name: /Make your own/ }))
    // The generator hides the round, the Note button with it.
    expect(document.activeElement).not.toBe(
      screen.getByRole("button", { name: "Note on Program", hidden: true })
    )
  })

  it("offers no microphone where there is no recognizer", () => {
    renderRound({ noteStore: memoryNoteStore(), dictation: null })
    fireEvent.click(screen.getByRole("button", { name: "Note on Program" }))
    fireEvent.click(screen.getByRole("button", { name: "This looks wrong" }))
    expect(
      screen.queryByRole("button", { name: "Speak" })
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/speech service/)).not.toBeInTheDocument()
  })

  it("carries the notes into the prompt the learner copies to their model", () => {
    renderRound({ noteStore: memoryNoteStore(), dictation: null })
    fireEvent.click(screen.getByRole("button", { name: "Note on Program" }))
    fireEvent.click(screen.getByRole("button", { name: "I don't know this" }))
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    fireEvent.click(screen.getByRole("button", { name: /Make your own/ }))
    fireEvent.click(screen.getByRole("button", { name: /Copy the prompt/ }))
    // jsdom has no clipboard, so the generator shows the prompt to copy by hand.
    return screen
      .findByText(/Learner notes \(newest first\)/, { exact: false })
      .then((node) => {
        expect(node.textContent).toContain(
          `On the program of round \`${COUNT_PRESENT.id}\`, before answering, the learner did not know this`
        )
      })
  })

  it("lists the session's notes on the session-complete screen", () => {
    withFakeClock(() => {
      renderRound({
        sessionDurationMs: 1000,
        noteStore: memoryNoteStore(),
        dictation: null,
      })
      fireEvent.click(screen.getByRole("button", { name: "Note on Program" }))
      fireEvent.click(
        screen.getByRole("button", { name: "Not sure what it's asking" })
      )
      fireEvent.change(screen.getByLabelText("Add words to the note"), {
        target: { value: "what is n here?" },
      })
      endSession()
      const notes = screen.getByRole("region", { name: "Your notes" })
      expect(
        within(notes).getByText("Not sure what it's asking")
      ).toBeInTheDocument()
      expect(within(notes).getByText("what is n here?")).toBeInTheDocument()
    })
  })
})

describe("RoundSession — recorded runs", () => {
  const HAS_DUPLICATE = AUTHORED_ROUNDS.find(
    (round) => round.id === "has-duplicate-sort-adjacent"
  )!

  beforeEach(() => {
    localStorage.clear()
  })

  /** Lets `resolveRoundRuns` (a Web Crypto digest, then the loader) settle. */
  async function settle(): Promise<void> {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }

  /** Chooses the rewrite whose member is (or is not) admissible, then commits `p`. */
  function commit(admissible: boolean, correct: boolean): void {
    goTo("Rewrites")
    const card = screen
      .getAllByRole("region", { name: /^Rewrite / })
      .find((node) => memberOfCard(node).admissible === admissible)!
    const answer = PROPOSITION_REGISTER[memberOfCard(card).propositionId]
    fireEvent.click(
      within(card).getByRole("button", { name: /^Choose rewrite/ })
    )
    fireEvent.click(propositionOption(answer.title, correct))
  }

  function runsPanel(): HTMLElement | null {
    return screen.queryByRole("region", { name: "Recorded runs" })
  }

  it("shows A's runs and the chosen rewrite's only once (d, p) is committed", async () => {
    const loadRuns = vi.fn(() =>
      Promise.resolve(BUNDLED_ROUND_RUNS[HAS_DUPLICATE.id])
    )
    renderRound({ rounds: [HAS_DUPLICATE], loadRuns })
    await settle()
    expect(loadRuns).toHaveBeenCalledWith(HAS_DUPLICATE.id)
    // Before the commitment the transcript is loaded but nowhere: it would
    // give the answer away (Ax. 9.2).
    for (const label of ["Program", "Bounds", "Budget", "Rewrites"]) {
      goTo(label)
      expect(runsPanel()).not.toBeInTheDocument()
    }
    expect(screen.queryByText("Runs")).not.toBeInTheDocument()

    commit(true, true)
    goTo("Runs")
    const panel = runsPanel()!
    expect(panel).toBeInTheDocument()
    expect(within(panel).getByText("The original program")).toBeVisible()
    expect(within(panel).getByText("Your rewrite")).toBeVisible()
    expect(
      within(panel).getByText(
        "Did not finish within the time limit, and was stopped."
      )
    ).toBeInTheDocument()
    expect(
      within(panel).getByText("Finished in 8 ms and printed false.")
    ).toBeInTheDocument()
    // Evidence, never the grade, never a class, never a count.
    expect(panel.textContent).not.toMatch(
      /Θ|\bO\(|quadratic|linear|logarithmic|admissible|correct|\d+ of \d+/i
    )
  })

  it("shows no runs between choosing a rewrite and committing its proposition", async () => {
    // The window a leak would live in: the rewrite is chosen, so its C′ run
    // would say whether it fits, and `p` is not yet committed.
    renderRound({
      rounds: [HAS_DUPLICATE],
      loadRuns: () => Promise.resolve(BUNDLED_ROUND_RUNS[HAS_DUPLICATE.id]),
    })
    await settle()
    goTo("Rewrites")
    const card = screen
      .getAllByRole("region", { name: /^Rewrite / })
      .find((node) => memberOfCard(node).admissible)!
    fireEvent.click(
      within(card).getByRole("button", { name: /^Choose rewrite/ })
    )
    await settle()
    // The pick moves the switcher to the last artifact (the proposition
    // card), and it does not wrap: walk back to the first, checking each,
    // then forward again. None may be, or hold, the runs.
    const noRuns = (): void => {
      expect(runsPanel()).not.toBeInTheDocument()
      const runsLabel = screen
        .queryAllByText("Runs", { selector: "p, span" })
        .filter((node) => node.closest("[hidden],[inert]") === null)
      expect(runsLabel).toHaveLength(0)
    }
    const step = (name: string): boolean => {
      const button = screen.getByRole("button", { name })
      if (button.hasAttribute("disabled")) return false
      fireEvent.click(button)
      return true
    }
    let visited = 1
    noRuns()
    while (step("Round: previous artifact")) {
      noRuns()
      visited += 1
    }
    while (step("Round: next artifact")) noRuns()
    expect(visited).toBeGreaterThanOrEqual(5)
  })

  it("shows the chosen rewrite's own runs, whichever the learner chose", async () => {
    renderRound({ rounds: [HAS_DUPLICATE] })
    await settle()
    commit(false, false)
    goTo("Runs")
    const rewrite = within(runsPanel()!)
      .getByText("Your rewrite")
      .closest("div")!
    // The distractor did not finish at the new bounds either.
    expect(
      within(rewrite).getByText(
        "Did not finish within the time limit, and was stopped."
      )
    ).toBeInTheDocument()
  })

  it("falls back to the bundled transcript when the server cannot be reached", async () => {
    renderRound({
      rounds: [HAS_DUPLICATE],
      loadRuns: () => Promise.reject(new Error("unreachable")),
    })
    await settle()
    commit(true, true)
    goTo("Runs")
    expect(runsPanel()).toBeInTheDocument()
  })

  it("shows no runs for a round whose bytes no transcript was recorded for", async () => {
    const edited: Round = {
      ...HAS_DUPLICATE,
      budget: { ...HAS_DUPLICATE.budget, wallClock: "a second or so" },
    }
    renderRound({
      rounds: [edited],
      loadRuns: () => Promise.resolve(BUNDLED_ROUND_RUNS[HAS_DUPLICATE.id]),
    })
    await settle()
    commit(true, true)
    await settle()
    expect(screen.queryByText("Runs")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Next round" })).toBeEnabled()
  })

  it("never asks for, or shows, runs of the learner's own round", async () => {
    const loadRuns = vi.fn(() =>
      Promise.resolve(BUNDLED_ROUND_RUNS[HAS_DUPLICATE.id])
    )
    renderRound({ pastedStore: memoryStore(HAS_DUPLICATE), loadRuns })
    expect(screen.getByText("Your round")).toBeInTheDocument()
    await settle()
    commit(true, true)
    await settle()
    expect(loadRuns).not.toHaveBeenCalled()
    expect(screen.queryByText("Runs")).not.toBeInTheDocument()
  })

  // Thm. 8.1, one whole session per case. All three sessions in one test took
  // about 5.5 s on CI's runner alone and passed 15 s whenever every
  // workspace's suite ran at once (#1673, #1684).
  describe("draws the same rounds whether runs load, fail or are absent (Thm. 8.1)", () => {
    /** The rounds six answers draw, in order, from a fresh ledger. */
    async function drawSession(
      loadRuns?: (roundId: string) => Promise<unknown>
    ): Promise<Array<string>> {
      localStorage.clear()
      const { unmount } = render(
        <RoundSession
          rounds={AUTHORED_ROUNDS}
          sessionSeed={11}
          pastedStore={memoryStore()}
          ledgerStore={memoryLedgerStore()}
          {...(loadRuns === undefined ? {} : { loadRuns })}
        />
      )
      const ids: Array<string> = []
      for (let round = 0; round < 6; round += 1) {
        await settle()
        goTo("Rewrites")
        const member = memberOfCard(
          screen.getAllByRole("region", { name: /^Rewrite / })[0]!
        )
        ids.push(
          AUTHORED_ROUNDS.find((candidate) =>
            candidate.diffOptions.some((option) => option.member === member)
          )!.id
        )
        commit(round % 2 === 0, round % 3 !== 0)
        fireEvent.click(screen.getByRole("button", { name: "Next round" }))
      }
      unmount()
      return ids
    }

    let absent: ReadonlyArray<string> = []
    beforeAll(async () => {
      absent = await drawSession()
    }, 10_000)

    it("with no runs at all, draws more than one round", () => {
      expect(absent).toHaveLength(6)
      expect(new Set(absent).size).toBeGreaterThan(1)
    })

    it("when runs load", async () => {
      expect(
        await drawSession((roundId) =>
          Promise.resolve(BUNDLED_ROUND_RUNS[roundId])
        )
      ).toEqual(absent)
    }, 10_000)

    it("when runs fail to load", async () => {
      expect(
        await drawSession(() => Promise.reject(new Error("unreachable")))
      ).toEqual(absent)
    }, 10_000)
  })
})
