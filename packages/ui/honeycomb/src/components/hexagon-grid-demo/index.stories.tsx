import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { DemoGrid } from "."

type Story = StoryObj<typeof DemoGrid>
type Meta = MetaObj<typeof DemoGrid>

export const Default: Story = {
  args: {
    cellCount: 53,
    hexSize: 30,
  },
}

export default {
  title: "UI/Honeycomb/Components/DemoGrid",
  component: DemoGrid,
} as Meta
