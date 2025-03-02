import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { GainLossBox } from "."

type Story = StoryObj<typeof GainLossBox>
type Meta = MetaObj<typeof GainLossBox>

export const Default: Story = {}

export default {
  title: "UI/PortfolioChart/Components/GainLossBox",
  component: GainLossBox,
} as Meta
