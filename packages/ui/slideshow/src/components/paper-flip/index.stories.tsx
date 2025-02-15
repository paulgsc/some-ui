import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { PaperFlip } from "."

type Story = StoryObj<typeof PaperFlip>
type Meta = MetaObj<typeof PaperFlip>

export const Default: Story = {
  args: {},
}

export default {
  title: "UI/Slideshow/Components/PaperFlip",
  component: PaperFlip,
} as Meta
