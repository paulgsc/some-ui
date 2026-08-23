import { useState } from "react"
import { sampleMilestones } from "@milestones/data"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { MilestoneTimeline } from "."

const meta = {
  title: "UI/Milestones/Milestone Timeline",
  component: MilestoneTimeline,
} satisfies Meta<typeof MilestoneTimeline>

export default meta
type Story = StoryObj<typeof meta>

export const Interactive: Story = {
  args: {
    milestones: sampleMilestones,
    activeIndex: 0,
    onSelect: () => undefined,
  },
  render: (args) => {
    const Demo = (): React.JSX.Element => {
      const [activeIndex, setActiveIndex] = useState(0)
      return (
        <div className="h-[420px] w-full max-w-sm bg-background p-4">
          <MilestoneTimeline
            milestones={args.milestones}
            activeIndex={activeIndex}
            onSelect={setActiveIndex}
            className="h-full"
          />
        </div>
      )
    }
    return <Demo />
  },
}
