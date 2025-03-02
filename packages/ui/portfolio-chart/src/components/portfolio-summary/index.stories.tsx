import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { PortfolioSummary } from "."

type Story = StoryObj<typeof PortfolioSummary>
type Meta = MetaObj<typeof PortfolioSummary>

export const Default: Story = {}

export default {
  title: "UI/PortfolioChart/Components/PortfolioSummary",
  component: PortfolioSummary,
} as Meta
