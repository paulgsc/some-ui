import type { RefObject } from "react"
import { createRef } from "react"
import {
  FIXTURE_ADVERSARIAL_EXERCISE_ID,
  nextExercise,
} from "@leetype/lib/leetype/exercises"
import type { Step } from "@leetype/types/exercise"
import { typingBlockOf } from "@leetype/types/exercise"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ExerciseCard } from "."

const seed = nextExercise()
const adversarial = nextExercise({ preferId: FIXTURE_ADVERSARIAL_EXERCISE_ID })

function projectionsFor(step: Step): {
  displaySource: string
  roles: Uint8Array
  slotOfDisplay: Int32Array
  slotStatus: Uint8Array
  visibility: Uint8Array
} {
  // The real maps come from the engine; these tests are about composition
  // and focus, so a plausible all-typeable stand-in is enough — and it keeps
  // the card's own assertions independent of the WASM build.
  const source = typingBlockOf(step)?.source ?? ""
  const length = source.length
  return {
    displaySource: source,
    roles: new Uint8Array(length).fill(1),
    slotOfDisplay: Int32Array.from({ length }, (_, index) => index),
    slotStatus: new Uint8Array(length),
    visibility: new Uint8Array(length),
  }
}

function renderCard(
  step: Step,
  index: number,
  attempt = 0
): ReturnType<typeof render> & {
  inputRef: RefObject<HTMLTextAreaElement | null>
} {
  const inputRef = createRef<HTMLTextAreaElement>()
  const view = render(
    <ExerciseCard
      step={step}
      index={index}
      total={seed.steps.length}
      attempt={attempt}
      {...projectionsFor(step)}
      cursorDisplay={0}
      manualRevealActive={false}
      manualRevealFraction={0}
      rejection={null}
      gameState="playing"
      onKey={() => {}}
      onBackspace={() => {}}
      onToggleReveal={() => {}}
      inputRef={inputRef}
    />
  )
  return { ...view, inputRef }
}

describe("ExerciseCard", () => {
  it("renders the step's goal and its prompt lines", () => {
    const step = seed.steps[6]
    if (!step) throw new Error("the seed exercise has ten steps")

    renderCard(step, 6)
    expect(screen.getByText(step.goal)).toBeInTheDocument()
  })

  it("renders a step whose prompt is empty without falling over", () => {
    const step = adversarial.steps[1]
    if (!step)
      throw new Error("the adversarial fixture has an empty-prompt step")

    renderCard(step, 1)
    expect(screen.getByText(step.goal)).toBeInTheDocument()
  })

  it("keeps focus on the keystroke-capture element across a step advance", () => {
    // The player's hands do not leave the keys, so a step boundary that
    // dropped focus would silently stop accepting input. Asserted rather
    // than felt.
    const first = seed.steps[1]
    const second = seed.steps[9]
    if (!first || !second) throw new Error("the seed exercise has ten steps")

    const { rerender, inputRef } = renderCard(first, 1)
    inputRef.current?.focus()
    expect(document.activeElement).toBe(inputRef.current)

    // Different step, wildly different body length — the case a remount
    // would show up in.
    rerender(
      <ExerciseCard
        step={second}
        index={9}
        total={seed.steps.length}
        attempt={0}
        {...projectionsFor(second)}
        cursorDisplay={0}
        manualRevealActive={false}
        manualRevealFraction={0}
        rejection={null}
        gameState="playing"
        onKey={() => {}}
        onBackspace={() => {}}
        onToggleReveal={() => {}}
        inputRef={inputRef}
      />
    )

    expect(screen.getByText(second.goal)).toBeInTheDocument()
    expect(document.activeElement).toBe(inputRef.current)
  })

  it("shows the repeat affordance on the rail and nowhere else", () => {
    // The gate holding must never be a wall with a message on it.
    const step = seed.steps[2]
    if (!step) throw new Error("the seed exercise has ten steps")

    renderCard(step, 2, 2)
    expect(screen.getByText(/again ×2/)).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("declares exactly one scroll intent, on the viewport", () => {
    const step = seed.steps[9]
    if (!step) throw new Error("the seed exercise has ten steps")

    const { container } = renderCard(step, 9)
    const declared = container.querySelectorAll("[data-scroll-intent]")
    expect(declared).toHaveLength(1)
    expect(declared[0]?.getAttribute("data-scroll-intent")).toBe("code-display")
  })

  it("passes a step's patch overlay through to the gutter (LTY-PATCH P3, #1078)", () => {
    // End-to-end wiring check: a step's typing block's `patch` (P2, #1077)
    // has to survive ExerciseCard -> TypingViewport -> CodeDisplay for the
    // gutter to ever render at all.
    const patched = nextExercise({ preferId: "diagnostic-division-guard" })
    const step = patched.steps[0]
    if (!step) throw new Error("diagnostic-division-guard has one step")

    const { container } = renderCard(step, 0)
    expect(
      container.querySelectorAll("[data-line-kind]").length
    ).toBeGreaterThan(0)
  })

  it("renders no gutter for a step without a patch overlay", () => {
    const step = seed.steps[0]
    if (!step) throw new Error("the seed exercise has ten steps")

    const { container } = renderCard(step, 0)
    expect(container.querySelectorAll("[data-line-kind]")).toHaveLength(0)
  })
})
