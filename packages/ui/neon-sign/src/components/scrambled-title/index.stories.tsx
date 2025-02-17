import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { ScrambledTitle } from "."

type Story = StoryObj<typeof ScrambledTitle>
type Meta = MetaObj<typeof ScrambledTitle>

export const Default: Story = {
  args: {
    className: "w-full h-52 bg-black text-center",
  },
}

export default {
  title: "UI/NeonSign/Components/ScrambledTitle",
  component: ScrambledTitle,
} as Meta
