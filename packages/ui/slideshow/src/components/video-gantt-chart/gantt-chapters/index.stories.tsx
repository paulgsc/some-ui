import { totalDuration, videoChapters } from "@slideshow/data/gantt-data"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

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

const meta = {
  title: "UI/SlideShow/Components/GanttChapters",
  component: GanttChapters,
} satisfies Meta

export default meta
