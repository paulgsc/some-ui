import { totalDuration, videoChapters } from "@slideshow/data/gantt-data"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { GanttDrawer } from "."

type Story = StoryObj<typeof GanttDrawer>
type Meta = MetaObj<typeof GanttDrawer>

export const Default: Story = {
  args: {
    chapters: videoChapters,
    totalDuration,
    className: "relative bg-black w-full h-150",
  },
}

export default {
  title: "UI/SlideShow/Components/GanttDrawer",
  component: GanttDrawer,
} as Meta
