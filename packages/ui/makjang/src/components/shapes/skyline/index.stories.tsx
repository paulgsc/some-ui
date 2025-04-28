import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { Skyline } from "."

type Story = StoryObj<typeof Skyline>
type Meta = MetaObj<typeof Skyline>

export const Default: Story = {}

export default {
  title: "UI/Makjang/Shapes/Skyline",
  component: Skyline,
} as Meta
