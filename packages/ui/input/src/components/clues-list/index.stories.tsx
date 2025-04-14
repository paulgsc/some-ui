import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { ClueList } from "."

type Story = StoryObj<typeof ClueList>
type Meta = MetaObj<typeof ClueList>

export const Default: Story = {
  args: {
    className: "w-full max-w-md",
  },
}

export default {
  title: "UI/Input/Components/ClueList",
  component: ClueList,
} as Meta
