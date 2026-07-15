import { CHALLENGES } from "@leetype/data/leetype"
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
