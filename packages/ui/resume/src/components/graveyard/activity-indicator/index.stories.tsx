import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { ActivityIndicator } from "."

type Story = StoryObj<typeof ActivityIndicator>
type Meta = MetaObj<typeof ActivityIndicator>

export const Default: Story = {}

export default {
  title: "UI/Resume/Components/Graveyard/ActivityIndicator",
  component: ActivityIndicator,
} as Meta
