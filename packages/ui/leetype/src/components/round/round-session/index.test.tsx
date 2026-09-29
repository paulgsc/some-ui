import { act } from "react"
import { RoundSession } from "@leetype/components/round/round-session"
import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import type { PastedRoundStore } from "@leetype/lib/leetype/pasted-round"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import { serializeRound } from "@leetype/lib/leetype/round-export"
import type { Round } from "@leetype/types/authored-round"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

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
