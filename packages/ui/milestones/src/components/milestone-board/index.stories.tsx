import type { Meta, StoryObj } from "@storybook/react-vite"

import { MilestoneBoard } from "."

const meta = {
  title: "UI/Milestones/Board",
  component: MilestoneBoard,
  // `neutralCanvas` drops the theme decorator's padded wrapper — this
  // board fills the viewport itself (`lg:h-dvh`), so the padding it exists
  // for elsewhere would just misrepresent the fixed-viewport claim here.
  parameters: { layout: "fullscreen", neutralCanvas: true },
} satisfies Meta<typeof MilestoneBoard>

export default meta
type Story = StoryObj<typeof meta>

export const FixedViewport: Story = {
  args: { cubeId: 401 },
}

export const FastCycle: Story = {
  args: { cubeId: 402, cycleMs: 1600 },
}
