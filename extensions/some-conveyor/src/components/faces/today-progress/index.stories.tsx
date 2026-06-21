import { VanillaBridge } from "@conveyor/components/story-bridge"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { TodayProgressFace, type TodayProgressProps } from "."

const meta: Meta<TodayProgressProps> = {
  title: "Extensions/Conveyor/Faces/TodayProgress",
  parameters: { layout: "centered", backgrounds: { default: "dark" } },
  render: (args) => <VanillaBridge factory={TodayProgressFace} props={args} />,
}
export default meta
type Story = StoryObj<TodayProgressProps>

export const Mixed: Story = {
  args: {
    tasks: [
      { label: "Morning run", done: true },
      { label: "Read 20 pages", done: true },
      { label: "Inbox zero", done: false },
    ],
  },
}
export const Empty: Story = { args: { tasks: [] } }
