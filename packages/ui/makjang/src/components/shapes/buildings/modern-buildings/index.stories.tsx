import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { ModernBuilding } from "."

type Story = StoryObj<typeof ModernBuilding>
type Meta = MetaObj<typeof ModernBuilding>

export const Default: Story = {}

export default {
  title: "UI/Makjang/ModernBuilding",
  component: ModernBuilding,
} as Meta
