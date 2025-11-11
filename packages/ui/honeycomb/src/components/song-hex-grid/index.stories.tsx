import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { SongHexGrid } from "."

type Story = StoryObj<typeof SongHexGrid>
type Meta = MetaObj<typeof SongHexGrid>

export const Default: Story = {
  args: {},
}

export default {
  title: "UI/Honeycomb/Components/SongHexGrid",
  component: SongHexGrid,
} as Meta
