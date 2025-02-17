import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { LensShutter } from "."

type Story = StoryObj<typeof LensShutter>
type Meta = MetaObj<typeof LensShutter>

export const Default: Story = {}

export default {
  title: "UI/Slideshow/Components/LensShutter",
  component: LensShutter,
} as Meta
