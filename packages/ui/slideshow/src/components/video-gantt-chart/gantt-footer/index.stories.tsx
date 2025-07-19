import { videoChapters } from "@slideshow/data/gantt-data"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { GanttFooter } from "."

type Story = StoryObj<typeof GanttFooter>
type Meta = MetaObj<typeof GanttFooter>

export const Default: Story = {
  args: {
    currentChapter: videoChapters[2],
    onJumpToTimestamp: () => {},
    className: "relative w-full h-150",
  },
}

export default {
  title: "UI/SlideShow/Components/GanttFooter",
  component: GanttFooter,
} as Meta
