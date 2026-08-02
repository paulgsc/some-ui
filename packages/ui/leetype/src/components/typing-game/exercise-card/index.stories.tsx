import { useRef } from "react"
import { usePreviewGame } from "@leetype/hooks/leetype/use-preview-game"
import {
  FIXTURE_ADVERSARIAL_EXERCISE_ID,
  nextExercise,
} from "@leetype/lib/leetype/exercises"
import type { Exercise } from "@leetype/types/exercise"
import { typingBlockOf } from "@leetype/types/exercise"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { ExerciseCard } from "."

const meta: Meta<typeof ExerciseCard> = {
  title: "UI/Input/Components/Typing/ExerciseCard",
  component: ExerciseCard,
}

export default meta
type Story = StoryObj<typeof ExerciseCard>

const seed = nextExercise()
const adversarial = nextExercise({ preferId: FIXTURE_ADVERSARIAL_EXERCISE_ID })

/**
 * The card in a definite box, which is the only way it is ever mounted for
 * real — the host gives it the viewport and its job is to fit.
 *
 * The heights below are the ones that actually break things: a short laptop
 * window with browser chrome open, and a tall one where a percentage split
 * would waste half the screen.
 */
const Mounted = ({
  exercise,
  stepIndex,
  typedChars,
  idleSeconds = 0,
  attempt = 0,
  width = "46rem",
  height = "34rem",
}: {
  exercise: Exercise
  stepIndex: number
  typedChars: number
  idleSeconds?: number
  attempt?: number
  width?: string
  height?: string
}) => {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const step = exercise.steps[stepIndex] ?? exercise.steps[0]
  const source = step ? (typingBlockOf(step)?.source ?? "") : ""
  const preview = usePreviewGame(source, typedChars, idleSeconds)

  if (!step || !preview) {
    return (
      <div className="p-5 text-sm text-muted-foreground">Starting engine…</div>
    )
  }

  return (
    <div
      className="code relative overflow-hidden rounded-lg border border-dashed border-border p-3"
      style={{ width, height }}
    >
      <ExerciseCard
        step={step}
        index={stepIndex}
        total={exercise.steps.length}
        attempt={attempt}
        roles={preview.roles}
        slotOfDisplay={preview.slotOfDisplay}
        slotStatus={preview.slotStatus}
        visibility={preview.visibility}
        cursorDisplay={preview.snapshot.cursorDisplay}
        rejection={null}
        gameState="playing"
        onKey={() => {}}
        onBackspace={() => {}}
        inputRef={inputRef}
      />
    </div>
  )
}

/** A short prompt over a one-line proof — the shape most steps have. */
export const ShortPromptShortBody: Story = {
  render: () => (
    <Mounted exercise={seed} stepIndex={1} typedChars={8} idleSeconds={6} />
  ),
}

/** A three-line prompt over a six-line proof. */
export const LongPromptLongBody: Story = {
  render: () => (
    <Mounted exercise={seed} stepIndex={9} typedChars={30} idleSeconds={20} />
  ),
}

/** The hostile prompt over a two-character proof. */
export const AbusivePromptTinyBody: Story = {
  render: () => (
    <Mounted
      exercise={adversarial}
      stepIndex={0}
      typedChars={1}
      idleSeconds={10}
    />
  ),
}

/** No prompt at all, and a body far taller than the viewport. */
export const NoPromptTallBody: Story = {
  render: () => (
    <Mounted
      exercise={adversarial}
      stepIndex={1}
      typedChars={40}
      idleSeconds={20}
    />
  ),
}

/**
 * A short window — a laptop with the browser chrome open. The prompt keeps
 * its share and the viewport takes the rest; neither collapses.
 */
export const ShortWindow: Story = {
  render: () => (
    <Mounted
      exercise={seed}
      stepIndex={9}
      typedChars={20}
      idleSeconds={15}
      height="20rem"
    />
  ),
}

/** A tall window, where a fixed page size would waste the space. */
export const TallWindow: Story = {
  render: () => (
    <Mounted
      exercise={adversarial}
      stepIndex={0}
      typedChars={0}
      idleSeconds={10}
      height="48rem"
    />
  ),
}

/** A narrow column, where every prompt line wraps. */
export const NarrowWindow: Story = {
  render: () => (
    <Mounted
      exercise={seed}
      stepIndex={6}
      typedChars={6}
      idleSeconds={8}
      width="22rem"
    />
  ),
}

/** The gate held: the rail says so, and nothing else changes. */
export const AfterAMissedGate: Story = {
  render: () => (
    <Mounted
      exercise={seed}
      stepIndex={4}
      typedChars={4}
      idleSeconds={6}
      attempt={2}
    />
  ),
}
