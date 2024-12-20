import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import HoneycombGrid from "."

type Meta = MetaObj<typeof HoneycombGrid>
type Story = StoryObj<typeof HoneycombGrid>

export const Default: Story = {
  args: {
    param: "foo",
  },
}

export default {
  title: "ScrorigamiHeatMap",
  component: HoneycombGrid,
} as Meta
