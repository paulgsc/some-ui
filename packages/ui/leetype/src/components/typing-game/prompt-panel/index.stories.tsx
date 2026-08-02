import type { JSX } from "react"
import {
  FIXTURE_ADVERSARIAL_EXERCISE_ID,
  nextExercise,
} from "@leetype/lib/leetype/exercises"
import type { Exercise } from "@leetype/types/exercise"
import { promptBlocksOf } from "@leetype/types/exercise"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { PromptPanel } from "."

const meta: Meta<typeof PromptPanel> = {
  title: "UI/Input/Components/Typing/PromptPanel",
  component: PromptPanel,
}

export default meta
type Story = StoryObj<typeof PromptPanel>

const seed = nextExercise()
const adversarial = nextExercise({ preferId: FIXTURE_ADVERSARIAL_EXERCISE_ID })

/**
 * The panel is bounded by its *box*, not by its contents — so every story
 * puts it in one. A narrow box and a short one are where a panel that
 * reached for a scrollbar would give itself away.
 */
const PanelInBox = ({
  exercise,
  stepIndex,
  width,
  height,
}: {
  exercise: Exercise
  stepIndex: number
  width: string
  height: string
}): JSX.Element => {
  const step = exercise.steps[stepIndex]

  return (
    <div
      className="code flex flex-col overflow-hidden rounded-lg border border-dashed border-border p-2"
      style={{ width: `min(${width}, 100%)`, height }}
    >
      <PromptPanel
        goal={step?.goal ?? ""}
        blocks={step ? promptBlocksOf(step) : []}
        position={stepIndex + 1}
        total={exercise.steps.length}
      />
    </div>
  )
}

/** The ordinary case: a one-line prompt. */
export const OneLine: Story = {
  render: () => (
    <PanelInBox exercise={seed} stepIndex={5} width="42rem" height="24rem" />
  ),
}

/** Three lines, the longest a well-authored step should carry. */
export const SeveralLines: Story = {
  render: () => (
    <PanelInBox exercise={seed} stepIndex={6} width="42rem" height="24rem" />
  ),
}

/**
 * The hostile one, from the adversarial fixture. This is the case the
 * doctrine exists for: it must page rather than scroll, and nothing may be
 * silently cut off.
 */
export const DeliberatelyAbusive: Story = {
  render: () => (
    <PanelInBox
      exercise={adversarial}
      stepIndex={0}
      width="42rem"
      height="24rem"
    />
  ),
}

/** The same abusive prompt in a narrow column, where every line wraps. */
export const AbusiveAndNarrow: Story = {
  render: () => (
    <PanelInBox
      exercise={adversarial}
      stepIndex={0}
      width="20rem"
      height="22rem"
    />
  ),
}

/** A step with no prompt blocks at all — the goal, and nothing else. */
export const GoalOnly: Story = {
  render: () => (
    <PanelInBox
      exercise={adversarial}
      stepIndex={1}
      width="42rem"
      height="20rem"
    />
  ),
}
