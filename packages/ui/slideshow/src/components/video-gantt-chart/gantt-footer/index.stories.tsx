import { videoChapters } from "@slideshow/data/gantt-data"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { GanttFooter } from "."

type Story = StoryObj<typeof GanttFooter>
type Meta = MetaObj<typeof GanttFooter>

export const Default: Story = {
  args: {
    currentChapter: videoChapters[2],
    onJumpToTimestamp: () => {},
  },
}

const meta = {
  title: "UI/SlideShow/Components/GanttFooter",
  component: GanttFooter,
} satisfies Meta

export default meta
