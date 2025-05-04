import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { DemoDice } from "."

type Story = StoryObj<typeof DemoDice>
type Meta = MetaObj<typeof DemoDice>

export const Default: Story = {
  args: {},
}

export default {
  title: "UI/Input/Components/DemoDice",
  component: DemoDice,
} as Meta
