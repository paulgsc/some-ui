import { cubeEventBus } from "@slideshow/hooks/use-cube-events"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { LadderTreeSVG } from "."

type Story = StoryObj<typeof LadderTreeSVG>
type Meta = MetaObj<typeof LadderTreeSVG>

export const Default: Story = {}

export default {
  title: "UI/Slideshow/Components/LadderTreeSVG",
  component: LadderTreeSVG,
} as Meta
