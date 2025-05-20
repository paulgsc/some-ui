import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { StatusLegend } from "."

type Story = StoryObj<typeof StatusLegend>
type Meta = MetaObj<typeof StatusLegend>

export const Default: Story = {}

export default {
  title: "UI/Resume/Components/StatusLegend",
  component: StatusLegend,
} as Meta
