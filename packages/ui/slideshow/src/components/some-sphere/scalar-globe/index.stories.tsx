import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { PolarSphere } from "."

type Story = StoryObj<typeof PolarSphere>
type Meta = MetaObj<typeof PolarSphere>

export const Default: Story = {
  args: {
    polarity: 2,
  },
}

export default {
  title: "UI/Slideshow/Components/PolarSphere",
  component: PolarSphere,
} as Meta
