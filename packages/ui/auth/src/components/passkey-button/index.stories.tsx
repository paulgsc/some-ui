import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "storybook/test"

import { PasskeyButton } from "."

type Story = StoryObj<typeof PasskeyButton>

export const Default: Story = {}

export const Pending: Story = {
  args: { pending: true },
}

const meta: Meta<typeof PasskeyButton> = {
  title: "UI/Auth/Components/PasskeyButton",
  component: PasskeyButton,
  tags: ["autodocs"],
  args: { onClick: fn() },
}

export default meta
