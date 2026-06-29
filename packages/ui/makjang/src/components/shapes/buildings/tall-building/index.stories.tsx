import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { TallBuilding } from "."

type Story = StoryObj<typeof TallBuilding>
type Meta = MetaObj<typeof TallBuilding>

export const Default: Story = {}

export default {
  title: "UI/Makjang/Shapes/Buildings/TallBuilding",
  component: TallBuilding,
} satisfies Meta
