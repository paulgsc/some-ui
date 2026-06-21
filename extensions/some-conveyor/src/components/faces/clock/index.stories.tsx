import { VanillaBridge } from "@conveyor/components/story-bridge"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { ClockFace, type ClockProps } from "."

const meta: Meta<ClockProps> = {
  title: "Extensions/Conveyor/Faces/Clock",
  parameters: { layout: "centered", backgrounds: { default: "dark" } },
  render: (args) => <VanillaBridge factory={ClockFace} props={args} />,
}
export default meta
type Story = StoryObj<ClockProps>

export const Default: Story = {
  args: { time: "14:32:07", date: "Wed, Jun 10" },
}
