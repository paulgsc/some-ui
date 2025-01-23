import type { Meta, StoryObj } from "@storybook/react"

import NeonSignText from "."

const meta = {
  title: "UI/NeonSign/NeonText",
  component: NeonSignText,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof NeonSignText>

export default meta
type Story = StoryObj<typeof NeonSignText>

export const Default: Story = {
  args: {
    text: "CODE PEN",
  },
}

export const CustomText: Story = {
  args: {
    text: "HELLO WORLD",
  },
}
