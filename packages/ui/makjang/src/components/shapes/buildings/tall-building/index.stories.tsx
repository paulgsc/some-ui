import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { TallBuilding } from "."

type Story = StoryObj<typeof TallBuilding>
type Meta = MetaObj<typeof TallBuilding>

export const Default: Story = {}

export default {
  title: "UI/Makjang/TallBuilding",
  component: TallBuilding,
} as Meta
