import type { Meta, StoryObj } from "@storybook/react"

import { RainingLetters } from "."

const meta = {
  title: "UI/NeonSign/Components/RainingLetters",
  component: RainingLetters,
} satisfies Meta<typeof RainingLetters>

export default meta
type Story = StoryObj<typeof RainingLetters>

export const Default: Story = {}
