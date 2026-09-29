import { act } from "react"
import { RoundSession } from "@leetype/components/round/round-session"
import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import type { Ledger } from "@leetype/lib/leetype/ledger"
import { EMPTY_LEDGER } from "@leetype/lib/leetype/ledger"
import type { Observation } from "@leetype/lib/leetype/ledger/observation"
import { LEDGER_STATE_COPY } from "@leetype/lib/leetype/ledger/state"
import type { LedgerStore } from "@leetype/lib/leetype/ledger/store"
import type { PastedRoundStore } from "@leetype/lib/leetype/pasted-round"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import { serializeRound } from "@leetype/lib/leetype/round-export"
import { BOOST_CAP, WEIGHT_FLOOR } from "@leetype/lib/leetype/round-sampler"
import type { Round } from "@leetype/types/authored-round"
import type { DiffSetMember } from "@leetype/types/round"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

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

/** Presses the switcher's Next until `label` is the artifact in view. */
function goTo(label: string): void {
  for (let step = 0; step < 6; step += 1) {
    if (screen.queryByText(label, { selector: "p, span" })) {
      const visible = screen
        .getAllByText(label)
        .some((node) => node.closest("[hidden]") === null)
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
    render(
      <RoundSession
        rounds={[COUNT_PRESENT]}
        sessionSeed={3}
        pastedStore={memoryStore()}
      />
    )
    expect(screen.getByText("Round 1")).toBeInTheDocument()
    // Prop. 8.1: the header counts rounds played, never a fraction of a
    // corpus. (The switcher's own "k of n" is a position among artifacts.)
    expect(screen.queryByText(/Round \d+ (of|\/)/)).not.toBeInTheDocument()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()

    goTo("Rewrites")
    chooseRewriteContaining("binary_search")

    // The option set appears and is brought into view.
    const answer = PROPOSITION_REGISTER["CW-P6"].title
    fireEvent.click(screen.getByRole("button", { name: new RegExp(answer) }))
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
    render(
      <RoundSession
        rounds={[COUNT_PRESENT]}
        sessionSeed={3}
        pastedStore={memoryStore()}
      />
    )
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
    render(
      <RoundSession
        rounds={[AUTHORED_ROUNDS[1]!]}
        sessionSeed={3}
        pastedStore={memoryStore(own)}
      />
    )
    expect(screen.getByText("Your round")).toBeInTheDocument()
  })

  it("takes a pasted round through the generate panel and plays it next", () => {
    const store = memoryStore()
    const set = vi.spyOn(store, "set")
    render(
      <RoundSession
        rounds={[AUTHORED_ROUNDS[1]!]}
        sessionSeed={3}
        pastedStore={store}
      />
    )
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
    vi.useFakeTimers({
      toFake: ["setInterval", "clearInterval", "performance"],
    })
    try {
      render(
        <RoundSession
          rounds={[COUNT_PRESENT]}
          sessionSeed={3}
          sessionDurationMs={1000}
          pastedStore={memoryStore()}
        />
      )
      goTo("Rewrites")
      chooseRewriteContaining("binary_search")
      fireEvent.click(
        screen.getByRole("button", {
          name: new RegExp(PROPOSITION_REGISTER["CW-P6"].title),
        })
      )
      fireEvent.click(screen.getByRole("button", { name: "Next round" }))
      expect(screen.getByText("Round 2")).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(1250)
      })
      expect(screen.getByText("1 round played")).toBeInTheDocument()
      fireEvent.click(screen.getByRole("button", { name: "Restart" }))
      expect(screen.getByText("Round 1")).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it("keeps a committed answer committed across opening and cancelling the generator", () => {
    render(
      <RoundSession
        rounds={[COUNT_PRESENT]}
        sessionSeed={3}
        pastedStore={memoryStore()}
      />
    )
    goTo("Rewrites")
    chooseRewriteContaining("binary_search")
    const answer = new RegExp(PROPOSITION_REGISTER["CW-P6"].title)
    fireEvent.click(screen.getByRole("button", { name: answer }))

    fireEvent.click(screen.getByRole("button", { name: /Make your own/ }))
    fireEvent.click(screen.getByRole("button", { name: "Back to the rounds" }))

    // Still one-shot: the option rows stay disabled after the round is
    // shown again.
    expect(screen.getByRole("button", { name: answer })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Next round" })).toBeEnabled()
  })

  it("files each (d, p) commitment into the ledger: three cases, the wrong choice named", () => {
    const ledgerStore = memoryLedgerStore()
    render(
      <RoundSession
        rounds={[COUNT_PRESENT]}
        sessionSeed={3}
        pastedStore={memoryStore()}
        ledgerStore={ledgerStore}
      />
    )
    goTo("Rewrites")
    chooseRewriteContaining("binary_search")
    const wrong = screen
      .getAllByRole("button")
      .find(
        (button) =>
          Object.values(PROPOSITION_REGISTER).some(({ title }) =>
            button.textContent.includes(title)
          ) && !button.textContent.includes(PROPOSITION_REGISTER["CW-P6"].title)
      )!
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

  it("never files the learner's own round: its key was in hand (Ax. 9.2)", () => {
    const ledgerStore = memoryLedgerStore()
    render(
      <RoundSession
        rounds={[AUTHORED_ROUNDS[1]!]}
        sessionSeed={3}
        pastedStore={memoryStore({ ...COUNT_PRESENT, id: "my-own-round" })}
        ledgerStore={ledgerStore}
      />
    )
    goTo("Rewrites")
    chooseRewriteContaining("binary_search")
    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(PROPOSITION_REGISTER["CW-P6"].title),
      })
    )
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
    render(
      <RoundSession
        rounds={AUTHORED_ROUNDS}
        sessionSeed={11}
        pastedStore={memoryStore()}
        ledgerStore={ledgerStore}
      />
    )
    const reached = new Set<string>()
    for (let draw = 0; draw < bound && reached.size < n; draw += 1) {
      // Every artifact is there before any answer: nothing is gated.
      for (const label of ["Program", "Bounds", "Budget", "Rewrites"]) {
        goTo(label)
        expect(
          screen
            .getAllByText(label)
            .some((node) => node.closest("[hidden]") === null)
        ).toBe(true)
      }
      const card = screen.getAllByRole("region", { name: /^Rewrite / })[0]!
      const answer = PROPOSITION_REGISTER[memberOfCard(card).propositionId]
      fireEvent.click(
        within(card).getByRole("button", { name: /^Choose rewrite/ })
      )
      const wrong = screen
        .getAllByRole("button")
        .find(
          (button) =>
            Object.values(PROPOSITION_REGISTER).some(({ title }) =>
              button.textContent.includes(title)
            ) && !button.textContent.includes(answer.title)
        )!
      fireEvent.click(wrong)

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
  })

  it("says recognized after one correct selection, and never mastery (Cor. 10.1)", () => {
    vi.useFakeTimers({
      toFake: ["setInterval", "clearInterval", "performance"],
    })
    try {
      render(
        <RoundSession
          rounds={[COUNT_PRESENT]}
          sessionSeed={3}
          sessionDurationMs={1000}
          pastedStore={memoryStore()}
          ledgerStore={memoryLedgerStore()}
        />
      )
      goTo("Rewrites")
      chooseRewriteContaining("binary_search")
      fireEvent.click(
        screen.getByRole("button", {
          name: new RegExp(PROPOSITION_REGISTER["CW-P6"].title),
        })
      )
      act(() => {
        vi.advanceTimersByTime(1250)
      })
      const ledger = screen.getByRole("region", { name: "Your ledger" })
      const row = within(ledger)
        .getByText(PROPOSITION_REGISTER["CW-P6"].title)
        .closest("li")!
      expect(row).toHaveTextContent(LEDGER_STATE_COPY.recognized)
      expect(row).not.toHaveTextContent(/Demonstrated:/)
      expect(document.body.textContent).not.toMatch(/master|%|streak|level/i)
    } finally {
      vi.useRealTimers()
    }
  })

  it("skips a round that fails the authored-round checks rather than playing it", () => {
    const broken: Round = {
      ...COUNT_PRESENT,
      id: "broken",
      graph: { kind: "work", cost: 1 },
    }
    render(
      <RoundSession
        rounds={[broken]}
        sessionSeed={3}
        pastedStore={memoryStore()}
      />
    )
    expect(
      screen.getByText(
        "No rounds are available right now. You can make your own."
      )
    ).toBeInTheDocument()
  })
})
