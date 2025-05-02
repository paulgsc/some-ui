import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { ClueInfo } from "."

type Story = StoryObj<typeof ClueInfo>
type Meta = MetaObj<typeof ClueInfo>

export const Default: Story = {
  args: {
    clue: "some clue foo foo foo",
    clueNum: 17,
  },
}

export default {
  title: "UI/Input/Components/ClueInfo",
  component: ClueInfo,
} as Meta
