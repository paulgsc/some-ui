import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { ContentTooltip } from "."

type Story = StoryObj<typeof ContentTooltip>
type Meta = MetaObj<typeof ContentTooltip>


export const Default: Story = {
}

export default {
  title: "UI/PortfolioChart/Components/ContentTooltip",
  component: ContentTooltip,
} as Meta
