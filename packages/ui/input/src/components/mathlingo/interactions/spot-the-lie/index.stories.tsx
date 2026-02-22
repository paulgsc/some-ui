import type { Meta, StoryObj } from "@storybook/react-vite"

import { SpotTheLie } from "."

const meta: Meta<typeof SpotTheLie> = {
  title: "UI/Input/Components/Mathlingo/Interactions/SpotTheLie",
  component: SpotTheLie,
  tags: ["autodocs"],
  argTypes: {
    onSubmit: { action: "submitted" },
  },
}

export default meta
type Story = StoryObj<typeof SpotTheLie>

const mockOptions = [
  { id: "1", label: "The sum of angles in a triangle is 180°." },
  { id: "2", label: "A square is a special type of rectangle." },
  { id: "3", label: "The number 1 is a prime number." }, // The Lie
  { id: "4", label: "An equilateral triangle has three equal sides." },
]

export const Default: Story = {
  args: {
    options: mockOptions,
    disabled: false,
    showResult: false,
  },
}

/**
 * When the user successfully selects the incorrect statement (the lie).
 * The lie is highlighted in green to show the user was correct in their choice.
 */
export const CorrectSpot: Story = {
  args: {
    options: mockOptions,
    correctAnswer: "3",
    showResult: true,
    // Note: Storybook can't easily set the internal useState 'selected' to "3"
    // without a custom render, but this shows the visual logic.
  },
}

/**
 * When the user selects a "truth" as the "lie".
 * The selected item turns red, and the actual lie is revealed with a line-through.
 */
export const IncorrectSpot: Story = {
  args: {
    options: mockOptions,
    correctAnswer: "3",
    showResult: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Displays the line-through style on the actual lie when the user guesses wrong.",
      },
    },
  },
}

export const Disabled: Story = {
  args: {
    options: mockOptions,
    disabled: true,
  },
}
