import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { InfoCard } from "."

type Story = StoryObj<typeof InfoCard>
type Meta = MetaObj<typeof InfoCard>

export const Default: Story = {}

export default {
  title: "UI/PortfolioChart/Components/InfoCard",
  component: InfoCard
} as Meta
