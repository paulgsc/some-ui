import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { BrickChartCarousel } from "."

type Story = StoryObj<typeof BrickChartCarousel>
type Meta = MetaObj<typeof BrickChartCarousel>

export const Default: Story = {}

export default {
  title: "UI/NFL/Components/BrickChartCarousel",
  component: BrickChartCarousel,
} as Meta
