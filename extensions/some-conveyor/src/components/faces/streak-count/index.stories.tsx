import { VanillaBridge } from "@conveyor/components/story-bridge"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { StreakCountFace, type StreakCountProps } from "."

const meta: Meta<StreakCountProps> = {
  title: "Extensions/Conveyor/Faces/StreakCount",
  parameters: { layout: "centered", backgrounds: { default: "dark" } },
  render: (args) => <VanillaBridge factory={StreakCountFace} props={args} />,
}
export default meta
type Story = StoryObj<StreakCountProps>

export const Default: Story = { args: { complete: 3, total: 5 } }
export const AllComplete: Story = { args: { complete: 5, total: 5 } }
export const Empty: Story = { args: { complete: 0, total: 0 } }
