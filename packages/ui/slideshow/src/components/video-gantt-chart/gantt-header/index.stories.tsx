import { totalDuration } from "@slideshow/data/gantt-data"
import { formatTime } from "@slideshow/utils/gantt-utils"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { GanttHeader } from "."

type Story = StoryObj<typeof GanttHeader>
type Meta = MetaObj<typeof GanttHeader>

export const Default: Story = {
  args: {
    currentTime: 2,
    isExpanded: true,
    totalDuration,
    formatTime,
  },
}

export default {
  title: "UI/SlideShow/Components/GanttHeader",
  component: GanttHeader,
} as Meta
