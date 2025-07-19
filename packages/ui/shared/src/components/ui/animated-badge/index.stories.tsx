import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { AnimatedBadge } from "."

type Story = StoryObj<typeof AnimatedBadge>
type Meta = MetaObj<typeof AnimatedBadge>

export const Default: Story = {}

export default {
  title: "UI/Shared/Components/AnimatedBadge",
  component: AnimatedBadge,
} as Meta
