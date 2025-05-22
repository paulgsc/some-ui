import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { TVStaticAnimation } from "."

type Story = StoryObj<typeof TVStaticAnimation>
type Meta = MetaObj<typeof TVStaticAnimation>

export const Default: Story = {
  args: {},
}

export default {
  title: "UI/Slideshow/Components/TVStaticAnimation",
  component: TVStaticAnimation,
} as Meta
