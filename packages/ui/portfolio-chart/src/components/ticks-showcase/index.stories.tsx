import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { TickShowcase } from "."

type Story = StoryObj<typeof TickShowcase>
type Meta = MetaObj<typeof TickShowcase>

export const Default: Story = {}

export default {
  title: "UI/PortfolioChart/Components/Ticks",
  component: TickShowcase,
} as Meta
