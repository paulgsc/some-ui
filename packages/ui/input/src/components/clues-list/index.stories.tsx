import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { ClueList } from "."

type Story = StoryObj<typeof ClueList>
type Meta = MetaObj<typeof ClueList>

export const Default: Story = {
  args: {
    className: "w-full max-w-md",
  },
}

const meta = {
  title: "UI/Input/Components/ClueList",
  component: ClueList,
} satisfies Meta

export default meta
