import type { Meta, StoryObj } from "@storybook/react-vite"

import { OrderItems } from "."

const meta: Meta<typeof OrderItems> = {
  title: "Mathlingo/Interactions/OrderItems",
  component: OrderItems,
  argTypes: {
    onSubmit: { action: "submitted" },
  },
}

export default meta
type Story = StoryObj<typeof OrderItems>

const mockOptions = [
  { id: "opt1", label: "2 + 2" },
  { id: "opt2", label: "5 * 3" },
  { id: "opt3", label: "10 / 2" },
  { id: "opt4", label: "100 - 1" },
]

export const Default: Story = {
  args: {
    options: mockOptions,
  },
}

export const Results: Story = {
  args: {
    options: mockOptions,
    showResult: true,
    correctOrder: ["opt1", "opt3", "opt2", "opt4"], // Swapped 2 and 3
  },
}

export const Disabled: Story = {
  args: {
    options: mockOptions,
    disabled: true,
  },
}
