import { TREIBER_CURRICULUM } from "@leetype/lib/leetype/story-fixtures"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { ChallengeBrief } from "."

const first = TREIBER_CURRICULUM[0]!
const middle = TREIBER_CURRICULUM[7]!
const last = TREIBER_CURRICULUM.at(-1)!

const meta: Meta<typeof ChallengeBrief> = {
  title: "UI/Input/Components/Typing/ChallengeBrief",
  component: ChallengeBrief,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="dark code max-w-md rounded-lg border border-border bg-card p-4">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof meta>

/** The first rung: nothing to build on yet, so "Builds on" is absent. */
export const FirstRung: Story = {
  args: {
    description: first.description,
    tags: first.tags,
    curriculum: first.curriculum,
  },
}

/** Mid-ladder, where the introduced/reinforced split carries the most weight. */
export const MidLadder: Story = {
  args: {
    description: middle.description,
    tags: middle.tags,
    curriculum: middle.curriculum,
  },
}

/** The final boss: the original dense problem, with nothing new left in it. */
export const FinalBoss: Story = {
  args: {
    description: last.description,
    tags: last.tags,
    curriculum: last.curriculum,
  },
}

/**
 * A challenge from the flat demo pool - no curriculum behind it, so the panel
 * degrades to exactly the description-plus-tags it was before curricula
 * existed.
 */
export const StandaloneProblem: Story = {
  args: {
    description:
      "Implement a stack (LIFO) using an array backing store with push and pop.",
    tags: ["stack", "lifo", "array"],
  },
}
