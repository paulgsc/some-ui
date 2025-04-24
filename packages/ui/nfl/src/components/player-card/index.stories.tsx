import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { NflPlayerCard } from "."

type Story = StoryObj<typeof NflPlayerCard>
type Meta = MetaObj<typeof NflPlayerCard>

export const Default: Story = {}

export default {
  title: "UI/NFL/Components/NflPlayerCard",
  component: NflPlayerCard,
} as Meta
