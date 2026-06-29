import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { Sun } from "."

type Story = StoryObj<typeof Sun>
type Meta = MetaObj<typeof Sun>

export const Default: Story = {}

export default {
  title: "UI/Makjang/Shapes/Sun",
  component: Sun,
} satisfies Meta
