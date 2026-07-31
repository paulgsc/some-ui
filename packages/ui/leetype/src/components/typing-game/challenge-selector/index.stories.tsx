import { TREIBER_CURRICULUM } from "@leetype/lib/leetype/story-fixtures"
import { CHALLENGES } from "@some-ui/content"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { ChallengeSelector } from "."

const meta: Meta<typeof ChallengeSelector> = {
  title: "UI/Input/Components/Typing/ChallengeSelector",
  component: ChallengeSelector,
  parameters: { layout: "padded" },
  argTypes: {
    onSelect: { action: "challenge selected" },
  },
}

export default meta
type Story = StoryObj<typeof ChallengeSelector>

export const NewPlayer: Story = {
  args: {
    challenges: CHALLENGES,
    progress: { xp: 0, level: 1, solves: [] },
  },
  parameters: {
    docs: { description: { story: "Level 1 player — algorithm mode locked" } },
  },
}

export const LeveledUp: Story = {
  args: {
    challenges: CHALLENGES,
    progress: { xp: 120, level: 3, solves: [] },
  },
  parameters: {
    docs: {
      description: { story: "Level 3 player — algorithm mode unlocked" },
    },
  },
}

export const FilteredMedium: Story = {
  args: {
    challenges: CHALLENGES,
    progress: { xp: 200, level: 4, solves: [] },
  },
  parameters: {
    docs: {
      description: { story: "Higher-level player viewing all challenges" },
    },
  },
}

/**
 * A decomposed curriculum instead of a flat pool: the picker drops the
 * mode/difficulty grid entirely and presents the ladder, because these
 * exercises are not interchangeable and their order is the product.
 */
export const DecomposedCurriculum: Story = {
  args: {
    challenges: TREIBER_CURRICULUM,
    progress: { xp: 0, level: 1, solves: [] },
  },
  parameters: {
    docs: {
      description: {
        story:
          "Ten Rust exercises building to a lock-free Treiber stack — stage headers, step numbers on a rail, and the per-exercise insight in place of the description.",
      },
    },
  },
}

/**
 * A pool that is mostly a ladder with a few standalone challenges alongside:
 * the loose rows collect under "Also available", after the curriculum.
 */
export const CurriculumWithLooseChallenges: Story = {
  args: {
    challenges: [...TREIBER_CURRICULUM, ...CHALLENGES.slice(0, 2)],
    progress: { xp: 200, level: 4, solves: [] },
  },
}
