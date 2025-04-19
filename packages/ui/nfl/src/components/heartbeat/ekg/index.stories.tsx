import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { EKGGraph } from "."

type Story = StoryObj<typeof EKGGraph>
type Meta = MetaObj<typeof EKGGraph>

export const Default: Story = {
  args: {},
}

export default {
  title: "UI/NFL/Components/Cardiogram/EKGGraph",
  component: EKGGraph,
} as Meta
