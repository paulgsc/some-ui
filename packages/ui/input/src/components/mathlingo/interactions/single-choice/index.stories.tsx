import type { Meta, StoryObj } from "@storybook/react-vite"

import { SingleChoice } from "."

const meta: Meta<typeof SingleChoice> = {
  title: "UI/Input/Components/Mathlingo/Interactions/SingleChoice",
  component: SingleChoice,
  tags: ["autodocs"],
  argTypes: {
    onSubmit: { action: "submitted" },
  },
}

export default meta
type Story = StoryObj<typeof SingleChoice>

const mockOptions = [
  { id: "a", label: "3.14 (Pi)" },
  { id: "b", label: "2.71 (e)" },
  { id: "c", label: "1.61 (Phi)" },
  { id: "d", label: "1.41 (√2)" },
]

/**
 * Standard interactive state. Clicking an option calls onSubmit
 * and shows the primary selection highlight.
 */
export const Default: Story = {
  args: {
    options: mockOptions,
  },
}

/**
 * Demonstrates the component when showResult is true.
 * In this case, the correct answer is highlighted in green.
 */
export const CorrectResult: Story = {
  args: {
    options: mockOptions,
    correctAnswer: "a",
    showResult: true,
  },
}

/**
 * Read-only state where interactions are disabled.
 */
export const Disabled: Story = {
  args: {
    options: mockOptions,
    disabled: true,
  },
}
