import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { TimelineEditor } from "."

type Story = StoryObj<typeof TimelineEditor>
type Meta = MetaObj<typeof TimelineEditor>

export const Default: Story = {
  args: {
    className: "size-full",
  },
}

const meta = {
  title: "UI/Input/Components/TimelineEditor",
  component: TimelineEditor,
} satisfies Meta

export default meta
