import type { Meta, StoryObj } from "@storybook/react-vite"

import { AddLegForm } from "."

type Story = StoryObj<typeof AddLegForm>

export default {
  title: "Sandlot/Components/AddLegForm",
  component: AddLegForm,
  parameters: { layout: "padded" },
  args: {
    onAdd: (leg) => {
      console.log("leg added:", leg)
    },
    onCancel: () => {
      console.log("cancelled")
    },
  },
} as Meta<typeof AddLegForm>

export const Default: Story = {
  args: {
    defaultStrike: 130,
  },
}

export const CustomExpiries: Story = {
  args: {
    defaultStrike: 125,
    suggestedExpiries: ["2025-02-21", "2025-03-21", "2025-06-20"],
  },
}
