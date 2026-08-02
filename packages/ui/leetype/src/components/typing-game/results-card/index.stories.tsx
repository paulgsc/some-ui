import type { Meta, StoryObj } from "@storybook/react-vite"

import { ResultsCard } from "."

const meta: Meta<typeof ResultsCard> = {
  title: "UI/Input/Components/Typing/ResultsCard",
  component: ResultsCard,
}

export default meta
type Story = StoryObj<typeof ResultsCard>

export const CleanRun: Story = {
  args: {
    exerciseTitle: "The Entry API",
    stats: {
      wpm: 74,
      accuracy: 98.2,
      elapsedTime: 214,
      errors: 6,
      stepsCompleted: 10,
      stepsEscaped: 0,
      assistance: 0.12,
    },
    onPlayAgain: () => {},
  },
}

/**
 * A run the gate had to carry. "Carried" is reported rather than hidden — a
 * step the repeat cap let the player past is not a step they cleared, and
 * showing the two as one number would make the gate decorative.
 */
export const CarriedByTheGate: Story = {
  args: {
    exerciseTitle: "The Entry API",
    stats: {
      wpm: 31,
      accuracy: 88.4,
      elapsedTime: 620,
      errors: 74,
      stepsCompleted: 10,
      stepsEscaped: 3,
      assistance: 0.71,
    },
    onPlayAgain: () => {},
  },
}
