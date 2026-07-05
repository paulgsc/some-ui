import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { HangulHexGrid } from "."

type Story = StoryObj<typeof HangulHexGrid>
type Meta = MetaObj<typeof HangulHexGrid>

export const Default: Story = {}

const meta: Meta = {
  title: "UI/Honeycomb/Components/HangulHexGrid",
  component: HangulHexGrid,
}
export default meta
