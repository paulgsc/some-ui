import { totalDuration, videoChapters } from "@slideshow/data/gantt-data"
import { formatTime } from "@slideshow/utils/gantt-utils"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { GanttHeader } from "."

type Story = StoryObj<typeof GanttHeader>
type Meta = MetaObj<typeof GanttHeader>

export const Default: Story = {
  args: {
    currentTime: 2,
    isExpanded: true,
    totalDuration,
    formatTime,
    className: "relative w-full h-150",
  },
}

export default {
  title: "UI/SlideShow/Components/GanttHeader",
  component: GanttHeader,
} as Meta
