import {
  FIXTURE_ADVERSARIAL_EXERCISE_ID,
  nextExercise,
} from "@leetype/lib/leetype/exercises"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { Leetype } from "."

const meta: Meta<typeof Leetype> = {
  title: "UI/Input/Components/Typing/Leetype",
  component: Leetype,
  parameters: { layout: "fullscreen" },
}

export default meta
type Story = StoryObj<typeof Leetype>

/**
 * The whole activity, mounted the one way hosts mount it.
 *
 * There is no `challenges` prop, no picker and no configuration step: the
 * exercise comes from the shim, and the player lands on a typing surface
 * with no intervening choice.
 */
const Mounted = ({ preferId }: { preferId?: string }) => (
  <div className="relative h-screen w-full p-4">
    <Leetype exercise={nextExercise(preferId ? { preferId } : undefined)} />
  </div>
)

export const Default: Story = {
  render: () => <Mounted />,
}

/** The adversarial fixture, for the shapes a generated corpus can produce. */
export const AdversarialCorpus: Story = {
  render: () => <Mounted preferId={FIXTURE_ADVERSARIAL_EXERCISE_ID} />,
}
