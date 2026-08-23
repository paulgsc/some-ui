import { sampleMilestones } from "@milestones/data"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { MilestoneGridCell } from "./milestone-grid-cell"

const meta = {
  title: "UI/Milestones/Milestone Grid Cell",
  component: MilestoneGridCell,
} satisfies Meta<typeof MilestoneGridCell>

export default meta
type Story = StoryObj<typeof meta>

export const Tumbling: Story = {
  args: {
    milestone: sampleMilestones[0]!,
    cubeId: 601,
    durationMs: 2200,
  },
  render: (args) => (
    <div className="h-[220px] w-[280px] bg-background p-4">
      <MilestoneGridCell {...args} />
    </div>
  ),
}

export const Active: Story = {
  args: {
    milestone: sampleMilestones[0]!,
    cubeId: 602,
    durationMs: 2200,
    active: true,
  },
  render: (args) => (
    <div className="h-[220px] w-[280px] bg-background p-4">
      <MilestoneGridCell {...args} />
    </div>
  ),
}
