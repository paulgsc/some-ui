import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { TaggartCredits } from "."

type Story = StoryObj<typeof TaggartCredits>
type Meta = MetaObj<typeof TaggartCredits>

export const Default: Story = {}

export default {
  title: "UI/Attributions/TaggartCredits",
  component: TaggartCredits,
} as Meta
