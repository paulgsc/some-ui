import { ReadingSession } from "@leetype/components/reading-game/reading-session"
import { claimOf } from "@leetype/lib/leetype/reading-probe"
import type { Exercise } from "@leetype/types/exercise"
import { typingBlockFromDiff } from "@leetype/types/exercise"
import type { RenderResult } from "@testing-library/react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

/**
 * A two-step fixture rather than a corpus exercise: the pinned behaviour here
 * is the session's own — select, check, read, advance — and a fixture keeps
 * the assertions readable without asserting anything about which corpus step
 * happens to be first today.
 */
const EXERCISE: Exercise = {
  id: "reading-session-fixture",
  title: "Reading session fixture",
  steps: [
    {
      id: "fixture-step-1",
      goal: "Guard the division so a zero count returns instead of panicking.",
      concepts: ["precondition-guard"],
      blocks: [
        {
          kind: "trace",
          headline: "PANIC",
          observations: [{ label: "count", value: "0" }],
        },
        typingBlockFromDiff({
          language: "rust",
          path: "src/stats/average.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "context",
              text: "fn average(total: i32, count: i32) -> i32 {\n    ",
            },
            { kind: "addition", text: "if count == 0 { return 0; }" },
            { kind: "context", text: "\n    total / count\n}" },
          ],
        }),
      ],
      rationale: {
        cause: "the function divides by count unconditionally",
        whyRepairDiscriminates:
          "returning early on a zero count avoids the division entirely",
      },
    },
    {
      id: "fixture-step-2",
      goal: "Hold the lookup as a place rather than a value.",
      concepts: ["entry-api"],
      obligation: "a lookup can be held as a place, not a value",
      blocks: [
        { kind: "prompt", lines: ["The map is looked up twice."] },
        { kind: "typing", source: "map.entry(key)", language: "rust" },
      ],
    },
  ],
}

const ANSWER_OF = (index: number): string =>
  claimOf(EXERCISE.steps[index]!).text

const mount = (
  props: Partial<Parameters<typeof ReadingSession>[0]> = {}
): RenderResult =>
  render(<ReadingSession exercise={EXERCISE} sessionSeed={1234} {...props} />)

describe("ReadingSession", () => {
  it("shows the hunk, the question and the answers on one screen", () => {
    const { container } = mount()
    expect(
      container.querySelectorAll("[data-line-kind]").length
    ).toBeGreaterThan(0)
    expect(screen.getByRole("group")).toBeInTheDocument()
    expect(screen.getAllByRole("radio").length).toBeGreaterThan(1)
    expect(screen.getByText(EXERCISE.steps[0]!.goal)).toBeInTheDocument()
  })

  it("offers the step's own claim among the options", () => {
    mount()
    expect(screen.getByText(ANSWER_OF(0))).toBeInTheDocument()
  })

  it("will not accept a check until something is picked", () => {
    mount()
    expect(screen.getByRole("button", { name: /check answer/i })).toBeDisabled()
    fireEvent.click(screen.getByText(ANSWER_OF(0)))
    expect(
      screen.getByRole("button", { name: /check answer/i })
    ).not.toBeDisabled()
  })

  // The learner must be able to look back at the code while reading why.
  it("keeps the hunk visible while the explanation is showing", () => {
    const { container } = mount()
    fireEvent.click(screen.getByText(ANSWER_OF(0)))
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }))

    expect(screen.getByText("Correct")).toBeInTheDocument()
    expect(screen.getByText("Why")).toBeInTheDocument()
    expect(
      screen.getByText(
        "returning early on a zero count avoids the division entirely"
      )
    ).toBeInTheDocument()
    expect(
      container.querySelectorAll("[data-line-kind]").length
    ).toBeGreaterThan(0)
  })

  it("marks the missed pick and still explains", () => {
    mount()
    const wrong = screen
      .getAllByRole("radio")
      .find((radio) => radio.getAttribute("value") !== EXERCISE.steps[0]!.id)
    expect(wrong).toBeDefined()
    fireEvent.click(wrong!)
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }))

    expect(screen.getByText("Not this one")).toBeInTheDocument()
    expect(screen.getByText("Correct")).toBeInTheDocument()
    expect(
      screen.getByText(
        "returning early on a zero count avoids the division entirely"
      )
    ).toBeInTheDocument()
  })

  it("advances to the next step with a clean slate", () => {
    mount()
    fireEvent.click(screen.getByText(ANSWER_OF(0)))
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }))
    fireEvent.click(screen.getByRole("button", { name: /next change/i }))

    expect(screen.getByText(EXERCISE.steps[1]!.goal)).toBeInTheDocument()
    // Selection, submission and feedback all reset.
    expect(screen.getByRole("button", { name: /check answer/i })).toBeDisabled()
    expect(screen.queryByText("Correct")).not.toBeInTheDocument()
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).not.toBeChecked()
    }
  })

  it("asks each family its own question", () => {
    mount()
    expect(screen.getByText(/repair/i)).toBeInTheDocument()
    fireEvent.click(screen.getByText(ANSWER_OF(0)))
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }))
    fireEvent.click(screen.getByRole("button", { name: /next change/i }))
    expect(screen.getByText(/establish/i)).toBeInTheDocument()
  })

  it("ends the fixed-exercise seam after its last step, and can restart", () => {
    const onSessionComplete = vi.fn()
    mount({ onSessionComplete })

    for (const index of [0, 1]) {
      fireEvent.click(screen.getByText(ANSWER_OF(index)))
      fireEvent.click(screen.getByRole("button", { name: /check answer/i }))
      fireEvent.click(screen.getByRole("button", { name: /next change/i }))
    }

    expect(screen.getByText("Session complete")).toBeInTheDocument()
    expect(screen.getByText("2 changes reviewed")).toBeInTheDocument()
    expect(onSessionComplete).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: /restart/i }))
    expect(screen.getByText(EXERCISE.steps[0]!.goal)).toBeInTheDocument()
  })

  // Every figure the typing surface reports is a fact about production
  // measured through keystroke timing. This surface has no keystrokes, so
  // showing any of them would be a claim about a channel that is switched
  // off — see the component's own doc comment.
  it("reports no WPM, accuracy or typing affordance anywhere", () => {
    const { container } = mount()
    expect(container.textContent).not.toMatch(/wpm/i)
    expect(container.textContent).not.toMatch(/accuracy/i)
    expect(container.querySelector("textarea")).toBeNull()
  })

  // A goal-derived step has neither a rationale nor an obligation, so its
  // claim *is* its goal. Printing the goal as the card's title would put the
  // answer above four options one of which repeats it word for word.
  it("does not print the goal as the title when the goal is the answer", () => {
    const goalOnly: Exercise = {
      id: "reading-goal-only",
      title: "Goal only",
      steps: [
        {
          id: "goal-only-step",
          goal: "Bring HashMap into scope.",
          concepts: [],
          blocks: [
            {
              kind: "prompt",
              lines: ["The map type is not yet named in this file."],
            },
            {
              kind: "typing",
              source: "use std::collections::HashMap;",
              language: "rust",
            },
          ],
        },
      ],
    }
    render(<ReadingSession exercise={goalOnly} sessionSeed={5} />)

    expect(screen.getByText(/what is this change for/i)).toBeInTheDocument()
    // The sentence appears exactly once — as an option, never as a heading
    // above the options.
    expect(screen.getAllByText("Bring HashMap into scope.")).toHaveLength(1)
    expect(
      screen.queryByRole("heading", { name: "Bring HashMap into scope." })
    ).not.toBeInTheDocument()
  })

  // Replay: same seed, same screen — including which distractors turned up
  // and in what order.
  it("is deterministic in its seed", () => {
    const first = mount()
    const optionsA = screen
      .getAllByRole("radio")
      .map((radio) => radio.getAttribute("value"))
    first.unmount()

    mount()
    const optionsB = screen
      .getAllByRole("radio")
      .map((radio) => radio.getAttribute("value"))
    expect(optionsB).toEqual(optionsA)
  })
})
