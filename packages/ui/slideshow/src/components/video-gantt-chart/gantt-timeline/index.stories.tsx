import { totalDuration, videoChapters } from "@slideshow/data/gantt-data"
import { formatTime } from "@slideshow/utils/gantt-utils"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { GanttTimeline } from "."

type Story = StoryObj<typeof GanttTimeline>
type Meta = MetaObj<typeof GanttTimeline>

export const Default: Story = {
  args: {
    chapters: videoChapters,
    totalDuration,
    formatTime,
    onJumpToTimestamp: () => {},
    className: "relative w-full h-150",
  },
}

const meta = {
  title: "UI/SlideShow/Components/GanttTimeline",
  component: GanttTimeline,
} satisfies Meta

export default meta
