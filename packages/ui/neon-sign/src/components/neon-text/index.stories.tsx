import type { Meta, StoryObj } from "@storybook/react"

import NeonSignText from "."

const meta = {
  title: "UI/NeonSign/NeonText",
  component: NeonSignText,
  argTypes: {
    text: { control: "text", description: "Text to display in neon effect" },
  },
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
