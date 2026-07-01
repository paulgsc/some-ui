import type { Meta, StoryObj } from "@storybook/react-vite"

import { LevelProgress } from "."

const meta: Meta<typeof LevelProgress> = {
  title: "UI/Input/Components/Typing/LevelProgress",
  component: LevelProgress,
  parameters: { layout: "padded" },
}

export default meta
type Story = StoryObj<typeof LevelProgress>

export const Level1: Story = {
  args: {
    progress: { xp: 0, level: 1, solves: [] },
  },
}

export const AlmostLevel3: Story = {
  args: {
    progress: {
      xp: 85,
      level: 2,
      solves: [
        {
          challengeId: "ds-linked-list",
          solvedAt: Date.now(),
          wpm: 35,
          accuracy: 92,
          elapsedTime: 120,
          errors: 3,
          n: null,
          displayMode: "shown",
          xpEarned: 10,
        },
      ],
    },
  },
  parameters: {
    docs: { description: { story: "Close to unlocking algorithm mode (Level 3)" } },
  },
}

export const AlgorithmUnlocked: Story = {
  args: {
    progress: {
      xp: 140,
      level: 3,
      solves: [],
    },
  },
  parameters: {
    docs: { description: { story: "Level 3 reached — algorithm mode is now accessible" } },
  },
}

export const Compact: Story = {
  args: {
    progress: { xp: 75, level: 2, solves: [] },
    compact: true,
  },
}
