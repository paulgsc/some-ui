import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { AnimatedBadge } from "."

type Story = StoryObj<typeof AnimatedBadge>
type Meta = MetaObj<typeof AnimatedBadge>

export const Default: Story = {}

const meta = {
  title: "UI/Shared/Components/AnimatedBadge",
  component: AnimatedBadge,
} satisfies Meta

export default meta
