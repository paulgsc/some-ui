import { totalDuration, videoChapters } from "@slideshow/data/gantt-data"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { GanttChapters } from "."

type Story = StoryObj<typeof GanttChapters>
type Meta = MetaObj<typeof GanttChapters>

export const Default: Story = {
  args: {
    chapters: videoChapters,
    totalDuration,
    onJumpToTimestamp: () => {},
  },
}

export default {
  title: "UI/SlideShow/Components/GanttChapters",
  component: GanttChapters,
} as Meta
