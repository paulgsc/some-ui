import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { SteppedBuilding } from "."

type Story = StoryObj<typeof SteppedBuilding>
type Meta = MetaObj<typeof SteppedBuilding>

export const Default: Story = {}

export default {
  title: "UI/Makjang/SteppedBuilding",
  component: SteppedBuilding,
} as Meta
