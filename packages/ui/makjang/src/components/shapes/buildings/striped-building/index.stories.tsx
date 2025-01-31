import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { StripedBuilding } from "."

type Story = StoryObj<typeof StripedBuilding>
type Meta = MetaObj<typeof StripedBuilding>

export const Default: Story = {}

export default {
  title: "UI/Makjang/StripedBuilding",
  component: StripedBuilding,
} as Meta
