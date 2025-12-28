import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { HangulHexGrid } from "."

type Story = StoryObj<typeof HangulHexGrid>
type Meta = MetaObj<typeof HangulHexGrid>

export const Default: Story = {}

export default {
  title: "UI/Honeycomb/Components/HangulHexGrid",
  component: HangulHexGrid,
} as Meta
