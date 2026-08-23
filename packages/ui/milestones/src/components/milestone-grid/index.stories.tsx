import { sampleMilestones } from "@milestones/data"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { MilestoneGrid } from "."

const meta = {
  title: "UI/Milestones/Milestone Grid",
  component: MilestoneGrid,
} satisfies Meta<typeof MilestoneGrid>

export default meta
type Story = StoryObj<typeof meta>

export const Wall: Story = {
  args: {
    milestones: sampleMilestones,
    activeIndex: 0,
    baseCubeId: 701,
  },
  render: (args) => (
    <div className="h-[640px] w-[720px] bg-background p-4">
      <MilestoneGrid {...args} />
    </div>
  ),
}
