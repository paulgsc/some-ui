import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { TvFooter } from "."

type Story = StoryObj<typeof TvFooter>
type Meta = MetaObj<typeof TvFooter>

export const Default: Story = {}

export default {
  title: "UI/Makjang/Shapes/Screens/TvFooter",
  component: TvFooter,
} as Meta
