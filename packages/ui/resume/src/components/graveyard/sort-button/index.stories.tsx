import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { SortButton } from "."

type Story = StoryObj<typeof SortButton>
type Meta = MetaObj<typeof SortButton>

export const Default: Story = {}

export default {
  title: "UI/Resume/Components/SortButton",
  component: SortButton,
} as Meta
