import { sampleMilestones } from "@milestones/data"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { MilestoneHero } from "./milestone-hero"

const meta = {
  title: "UI/Milestones/Milestone Hero",
  component: MilestoneHero,
} satisfies Meta<typeof MilestoneHero>

export default meta
type Story = StoryObj<typeof meta>

export const WithStats: Story = {
  args: {
    milestone: sampleMilestones[0]!,
    index: 0,
    count: sampleMilestones.length,
  },
  render: (args) => (
    <div className="max-w-3xl bg-background p-8">
      <MilestoneHero {...args} />
    </div>
  ),
}

export const WithoutStats: Story = {
  args: {
    milestone: sampleMilestones[2]!,
    index: 2,
    count: sampleMilestones.length,
  },
  render: (args) => (
    <div className="max-w-3xl bg-background p-8">
      <MilestoneHero {...args} />
    </div>
  ),
}
