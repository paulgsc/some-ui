import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { BarGroup } from "."

type Story = StoryObj<typeof BarGroup>
type Meta = MetaObj<typeof BarGroup>

export const Default: Story = {
  args: {},
}

export default {
  title: "UI/PortfolioChart/Components/BarGroup",
  component: BarGroup,
} as Meta
