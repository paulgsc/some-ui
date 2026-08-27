import { Leetype } from "@leetype/components/leetype"
import {
  FIXTURE_EXERCISE_ID,
  nextExercise,
} from "@leetype/lib/leetype/exercises"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta: Meta<typeof Leetype> = {
  title: "UI/Input/Components/Leetype",
  component: Leetype,
  parameters: { layout: "fullscreen" },
}

export default meta
type Story = StoryObj<typeof Leetype>

/**
 * How every host mounts it: no props, no configuration step — and, with no
 * `exercise` forced, the learner's first screen is `ExercisePicker`. Resize
 * the preview past 768px and the picker (and, once something is chosen, the
 * session behind it) switches from the mobile layout to the desktop one.
 */
export const Auto: Story = {
  render: () => (
    <div className="relative h-screen w-full">
      <Leetype sessionSeed={20260826} />
    </div>
  ),
}

/** The small-screen picker and probe, pinned regardless of the preview's width. */
export const Reading: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => (
    <div className="relative h-screen w-full">
      <Leetype surface="reading" sessionSeed={20260826} />
    </div>
  ),
}

/** The wide-viewport picker and probe, pinned regardless of the preview's width. */
export const Typing: Story = {
  render: () => (
    <div className="relative h-screen w-full p-4">
      <Leetype surface="typing" sessionSeed={20260826} />
    </div>
  ),
}

/**
 * A fixed `exercise` skips the picker entirely — the seam a preview or deep
 * link uses, and the one place in this file that lands straight on a
 * session instead of a chooser.
 */
export const FixedExercise: Story = {
  render: () => (
    <div className="relative h-screen w-full p-4">
      <Leetype
        exercise={nextExercise({ preferId: FIXTURE_EXERCISE_ID })}
        sessionSeed={20260826}
      />
    </div>
  ),
}
