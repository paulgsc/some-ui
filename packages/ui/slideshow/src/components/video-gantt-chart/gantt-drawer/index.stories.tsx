import { totalDuration, videoChapters } from "@slideshow/data/gantt-data"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { GanttDrawer } from "."

type Story = StoryObj<typeof GanttDrawer>
type Meta = MetaObj<typeof GanttDrawer>

export const Default: Story = {
  args: {
    chapters: videoChapters,
    totalDuration,
    className: "relative bg-black w-full h-150",
  },
  render: (args) => (
    <main className="absolute inset-0">
      <div className="size-40 border border-red-500" />
      <GanttDrawer {...args} />
    </main>
  ),
}

export default {
  title: "UI/SlideShow/Components/GanttDrawer",
  component: GanttDrawer,
} as Meta
