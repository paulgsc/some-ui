import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { NflPlayerCardShuffle } from "."

type Story = StoryObj<typeof NflPlayerCardShuffle>
type Meta = MetaObj<typeof NflPlayerCardShuffle>

export const Default: Story = {}

export default {
  title: "UI/NFL/Components/NflPlayerCardShuffle",
  component: NflPlayerCardShuffle,
} as Meta
