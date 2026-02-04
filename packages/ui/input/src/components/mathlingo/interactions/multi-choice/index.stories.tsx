import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { MultiChoice } from "."

const meta: MetaObj<typeof MultiChoice> = {
  title: "UI/Input/Components/Mathlingo/MultiChoice",
  component: MultiChoice,
  tags: ["autodocs"],
  argTypes: {
    onSubmit: { action: "submitted" },
  },
}

export default meta
type Story = StoryObj<typeof MultiChoice>

const mockOptions = [
  { id: "1", label: "Option One: The first choice" },
  { id: "2", label: "Option Two: The second choice" },
  { id: "3", label: "Option Three: The third choice" },
  { id: "4", label: "Option Four: The fourth choice" },
]

/**
 * Standard interactive state where the user can select multiple options.
 */
export const Default: Story = {
  args: {
    options: mockOptions,
    disabled: false,
    showResult: false,
  },
}

/**
 * Displays how the component looks once the results are revealed.
 * Option 1: Correct & Selected (Success)
 * Option 2: Wrong Selection (Destructive)
 * Option 3: Missed Correct Answer (Success border, muted)
 */
export const ResultsRevealed: Story = {
  args: {
    options: mockOptions,
    showResult: true,
    correctAnswers: ["1", "3"],
    // In Storybook, we can't easily set the internal 'selected' Set state
    // without a decorator, but we can see the logic for 'isMissed' (3)
    // and 'isCorrect' (1) if the user were to click them in the play function.
  },
}

/**
 * The component in a read-only state.
 */
export const Disabled: Story = {
  args: {
    options: mockOptions,
    disabled: true,
  },
}

/**
 * Story with many options to test scrolling and layout.
 */
export const LongList: Story = {
  args: {
    options: Array.from({ length: 10 }, (_, i) => ({
      id: `${i}`,
      label: `Automated Option ${i + 1}`,
    })),
  },
}
