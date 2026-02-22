import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { ClueInfo } from "."

type Story = StoryObj<typeof ClueInfo>
type Meta = MetaObj<typeof ClueInfo>

export const Default: Story = {
  args: {
    clue: "some clue foo foo foo",
  },
}

export default {
  title: "UI/Input/Components/ClueInfo",
  component: ClueInfo,
} as Meta
