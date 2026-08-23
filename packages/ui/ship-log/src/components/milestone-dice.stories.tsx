import type { Meta, StoryObj } from "@storybook/react-vite"

import { milestones } from "../data"
import { MilestoneDice } from "./milestone-dice"

const meta = {
  title: "UI/Ship Log/Milestone Dice",
  component: MilestoneDice,
} satisfies Meta<typeof MilestoneDice>
export default meta
type Story = StoryObj<typeof meta>

export const Archive: Story = {
  args: { milestones },
  render: (args) => (
    <div
      className="ship-log-shell"
      style={{ minHeight: 600, display: "grid", placeItems: "center" }}
    >
      <div className="ship-stage" style={{ width: 600, height: 420 }}>
        <MilestoneDice {...args} />
      </div>
    </div>
  ),
}
