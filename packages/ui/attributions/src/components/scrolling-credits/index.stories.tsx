import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { ScrollingCredits } from "."

type Story = StoryObj<typeof ScrollingCredits>
type Meta = MetaObj<typeof ScrollingCredits>

export const Default: Story = {}

export default {
  title: "UI/Attributions/ScrollingCredits",
  component: ScrollingCredits,
} as Meta
