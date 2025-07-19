import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { BrickChartCarousel } from "."

type Story = StoryObj<typeof BrickChartCarousel>
type Meta = MetaObj<typeof BrickChartCarousel>

export const Default: Story = {
  render: () => (
    <main className="absolute inset-0">
      <BrickChartCarousel />
    </main>
  ),
}

export default {
  title: "UI/NFL/Components/BrickChartCarousel",
  component: BrickChartCarousel,
} as Meta
