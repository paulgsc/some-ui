import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { Legend } from "."

type Story = StoryObj<typeof Legend>
type Meta = MetaObj<typeof Legend>

export const Default: Story = {}

export default {
  title: "UI/Resume/Components/Graveyard/Legend",
  component: Legend,
} as Meta
