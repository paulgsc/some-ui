import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { CrosswordGridSvg } from "."

type Story = StoryObj<typeof CrosswordGridSvg>
type Meta = MetaObj<typeof CrosswordGridSvg>

export const Default: Story = {
  args: {
    className: "absolute inset-0 border border-red-600",
    duration: 15 * 1000,
  },
}

export default {
  title: "UI/Input/Components/CrosswordGridSvg",
  component: CrosswordGridSvg,
} as Meta
