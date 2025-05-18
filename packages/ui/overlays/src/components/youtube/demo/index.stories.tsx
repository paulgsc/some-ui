import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { ObsStatusPanel } from "."

type Story = StoryObj<typeof ObsStatusPanel>
type Meta = MetaObj<typeof ObsStatusPanel>

export const Default: Story = {
  args: {},
}

export default {
  title: "UI/Overlays/Components/ObsStatusPanel",
  component: ObsStatusPanel,
} as Meta
