import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { Sun } from "."

type Story = StoryObj<typeof Sun>
type Meta = MetaObj<typeof Sun>

export const Default: Story = {}

export default {
  title: "UI/Makjang/Sun",
  component: Sun,
} as Meta
