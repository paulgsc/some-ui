import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { TimelineEditor } from "."

type Story = StoryObj<typeof TimelineEditor>
type Meta = MetaObj<typeof TimelineEditor>

export const Default: Story = {
  args: {
    className: "size-full",
  },
}

export default {
  title: "UI/Input/Components/TimelineEditor",
  component: TimelineEditor,
} as Meta
