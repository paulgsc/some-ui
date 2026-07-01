import type { Meta, StoryObj } from "@storybook/react-vite"
import { CHALLENGES } from "@input/data/leetype"

import { ResultsCard } from "."

const meta: Meta<typeof ResultsCard> = {
  title: "UI/Input/Components/Typing/ResultsCard",
  component: ResultsCard,
  parameters: { layout: "padded" },
  argTypes: {
    onPlayAgain: { action: "play again" },
    onChooseChallenge: { action: "choose challenge" },
  },
}

export default meta
type Story = StoryObj<typeof ResultsCard>

const dsChallenge = CHALLENGES.find((c) => c.id === "ds-linked-list")!
const hardChallenge = CHALLENGES.find((c) => c.id === "ds-min-heap")!
const algoChallenge = CHALLENGES.find((c) => c.id === "algo-merge-sort")!

export const FastSolve: Story = {
  args: {
    challenge: dsChallenge,
    solve: {
      challengeId: "ds-linked-list",
      solvedAt: Date.now(),
      wpm: 52,
      accuracy: 97.3,
      elapsedTime: 145,
      errors: 1,
      n: null,
      displayMode: "shown",
      xpEarned: 0, // shown for display, real value comes from xpEarned prop
    },
    xpEarned: 15,
    leveledUp: false,
    newLevel: 2,
  },
}

export const LevelUp: Story = {
  args: {
    challenge: dsChallenge,
    solve: {
      challengeId: "ds-linked-list",
      solvedAt: Date.now(),
      wpm: 44,
      accuracy: 88,
      elapsedTime: 210,
      errors: 4,
      n: null,
      displayMode: "shown",
      xpEarned: 0,
    },
    xpEarned: 11,
    leveledUp: true,
    newLevel: 3,
  },
  parameters: {
    docs: { description: { story: "Shows level-up banner when player reaches a new level" } },
  },
}

export const HardModeHidden: Story = {
  args: {
    challenge: hardChallenge,
    solve: {
      challengeId: "ds-min-heap",
      solvedAt: Date.now(),
      wpm: 61,
      accuracy: 94.5,
      elapsedTime: 320,
      errors: 6,
      n: null,
      displayMode: "hidden",
      xpEarned: 0,
    },
    xpEarned: 108,
    leveledUp: false,
    newLevel: 4,
  },
  parameters: {
    docs: { description: { story: "Hard challenge completed in hidden mode — large XP bonus" } },
  },
}

export const AlgorithmWithN: Story = {
  args: {
    challenge: algoChallenge,
    solve: {
      challengeId: "algo-merge-sort",
      solvedAt: Date.now(),
      wpm: 38,
      accuracy: 91.2,
      elapsedTime: 480,
      errors: 9,
      n: "large",
      displayMode: "shown",
      xpEarned: 0,
    },
    xpEarned: 58,
    leveledUp: false,
    newLevel: 4,
  },
  parameters: {
    docs: { description: { story: "Algorithm challenge solved with large N — N multiplier shown" } },
  },
}
