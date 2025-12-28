import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { ModernBuilding } from "."

type Story = StoryObj<typeof ModernBuilding>
type Meta = MetaObj<typeof ModernBuilding>

export const Default: Story = {}

export default {
  title: "UI/Makjang/Shapes/Buildings/ModernBuilding",
  component: ModernBuilding,
} as Meta
