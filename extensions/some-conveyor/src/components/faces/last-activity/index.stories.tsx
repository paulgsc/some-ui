import { VanillaBridge } from "@conveyor/components/story-bridge"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { LastActivityFace, type LastActivityProps } from "."

const meta: Meta<LastActivityProps> = {
  title: "Extensions/Conveyor/Faces/LastActivity",
  parameters: { layout: "centered", backgrounds: { default: "dark" } },
  render: (args) => <VanillaBridge factory={LastActivityFace} props={args} />,
}
export default meta
type Story = StoryObj<LastActivityProps>

export const Recent: Story = {
  args: { lastActiveText: "5m ago", focusIcon: "🏃", focusName: "Fitness" },
}
export const Idle: Story = {
  args: { lastActiveText: "no activity", focusIcon: "", focusName: "--" },
}
