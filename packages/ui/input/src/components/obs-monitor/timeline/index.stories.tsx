import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { Timeline } from "."

type Story = StoryObj<typeof Timeline>
type Meta = MetaObj<typeof Timeline>

export const Default: Story = {
  args: {
    currentTime: 100,
  },
}

export default {
  title: "UI/Input/Components/OBSMonitor/Timeline",
  component: Timeline,
} as Meta
