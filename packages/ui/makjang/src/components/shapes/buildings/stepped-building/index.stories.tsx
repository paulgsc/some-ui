import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { SteppedBuilding } from "."

type Story = StoryObj<typeof SteppedBuilding>
type Meta = MetaObj<typeof SteppedBuilding>

export const Default: Story = {}

export default {
  title: "UI/Makjang/Shapes/Buildings/SteppedBuilding",
  component: SteppedBuilding,
} satisfies Meta
