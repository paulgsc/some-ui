import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { OfficeBuilding } from "."

type Story = StoryObj<typeof OfficeBuilding>
type Meta = MetaObj<typeof OfficeBuilding>

export const Default: Story = {}

export default {
  title: "UI/Makjang/OfficeBuilding",
  component: OfficeBuilding,
} as Meta
