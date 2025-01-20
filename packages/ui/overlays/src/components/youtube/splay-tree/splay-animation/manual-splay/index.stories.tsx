import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import SplayTreeVisualization from "."

type Story = StoryObj<typeof SplayTreeVisualization>
type Meta = MetaObj<typeof SplayTreeVisualization>

export const Default: Story = {}

export default {
  title: "Overlays/Youtube/SplayTree/Manual",
  component: SplayTreeVisualization,
} as Meta
