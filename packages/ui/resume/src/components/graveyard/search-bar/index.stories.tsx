import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { SearchBar } from "."

type Story = StoryObj<typeof SearchBar>
type Meta = MetaObj<typeof SearchBar>

export const Default: Story = {}

export default {
  title: "UI/Resume/Components/SearchBar",
  component: SearchBar,
} as Meta
