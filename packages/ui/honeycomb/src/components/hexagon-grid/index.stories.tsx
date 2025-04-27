import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { HexGrid } from "."

type Story = StoryObj<typeof HexGrid>
type Meta = MetaObj<typeof HexGrid>

export const Default: Story = {
  args: {
    radius: 5,
    hexSize: 30,
  },
}

export default {
  title: "UI/Honeycomb/Components/HexGrid",
  component: HexGrid,
} as Meta
