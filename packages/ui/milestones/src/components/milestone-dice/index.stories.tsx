import { sampleMilestones } from "@milestones/data"
import { useMilestoneCycle } from "@milestones/hooks/use-milestone-cycle"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { MilestoneDice } from "."

const meta = {
  title: "UI/Milestones/Milestone Dice",
  component: MilestoneDice,
} satisfies Meta<typeof MilestoneDice>

export default meta
type Story = StoryObj<typeof meta>

export const Archive: Story = {
  args: { milestones: sampleMilestones, activeIndex: 0, cubeId: 501 },
  render: (args) => (
    <div className="flex h-[420px] w-full items-center justify-center bg-background p-6">
      <MilestoneDice {...args} className="h-full max-w-2xl" />
    </div>
  ),
}

export const SyncedWithTimer: Story = {
  args: { milestones: sampleMilestones, activeIndex: 0, cubeId: 502 },
  render: (args) => {
    const Demo = (): React.JSX.Element => {
      const { activeIndex } = useMilestoneCycle({
        count: args.milestones.length,
        cubeId: args.cubeId,
        intervalMs: 2400,
      })
      return (
        <div className="flex h-[420px] w-full flex-col items-center justify-center gap-3 bg-background p-6">
          <MilestoneDice
            {...args}
            activeIndex={activeIndex}
            className="h-full max-w-2xl"
          />
          <p className="text-sm text-muted-foreground">
            Active: {sampleMilestones[activeIndex]?.title}
          </p>
        </div>
      )
    }
    return <Demo />
  },
}
