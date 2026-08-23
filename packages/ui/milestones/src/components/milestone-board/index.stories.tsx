import type { Meta, StoryObj } from "@storybook/react-vite"

import { MilestoneBoard } from "."

const meta = {
  title: "UI/Milestones/Board",
  component: MilestoneBoard,
  // `neutralCanvas` looked appealing for dropping the theme decorator's
  // padded wrapper, but it's built for Comfort Lab's isolated fixtures — it
  // unconditionally pins the canvas to light and never reads the toolbar's
  // session global, so it silently defeated theme switching for this story
  // entirely. `layout: "fullscreen"` alone still removes Storybook's own
  // chrome; the decorator's ~24px canvas padding that remains is a preview-
  // only artifact, not something a real consumer of this board would see.
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof MilestoneBoard>

export default meta
type Story = StoryObj<typeof meta>

export const FixedViewport: Story = {
  args: { cubeId: 401 },
}

export const FastCycle: Story = {
  args: { cubeId: 402, cycleMs: 1600 },
}
