import {
  FIXTURE_ADVERSARIAL_EXERCISE_ID,
  FIXTURE_DIAGNOSTIC_EXERCISE_IDS,
  FIXTURE_EXERCISE_ID,
  nextExercise,
} from "@leetype/lib/leetype/exercises"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { TypingSession } from "."

const meta: Meta<typeof TypingSession> = {
  title: "UI/Input/Components/Typing/TypingSession",
  component: TypingSession,
  parameters: { layout: "fullscreen" },
}

export default meta
type Story = StoryObj<typeof TypingSession>

/**
 * The whole activity, mounted the one way hosts mount it.
 *
 * There is no `challenges` prop, no picker and no configuration step: the
 * exercise comes from the shim, and the player lands on a typing surface
 * with no intervening choice.
 */
const Mounted = ({ preferId = FIXTURE_EXERCISE_ID }: { preferId?: string }) => (
  <div className="relative h-screen w-full p-4">
    <TypingSession exercise={nextExercise({ preferId })} />
  </div>
)

export const Default: Story = {
  render: () => <Mounted />,
}

/** The adversarial fixture, for the shapes a generated corpus can produce. */
export const AdversarialCorpus: Story = {
  render: () => <Mounted preferId={FIXTURE_ADVERSARIAL_EXERCISE_ID} />,
}

/**
 * A falsification→repair instance (LTY-FAMILIES A1/A3), mounted through the
 * exact same `TypingSession`/`ExerciseCard` machinery as every other exercise —
 * the acceptance criterion this story exists to demonstrate: no new branch
 * anywhere in the runner or the shell for a diagnostic step to play.
 */
export const DiagnosticInstance: Story = {
  render: () => <Mounted preferId={FIXTURE_DIAGNOSTIC_EXERCISE_IDS[0]} />,
}
