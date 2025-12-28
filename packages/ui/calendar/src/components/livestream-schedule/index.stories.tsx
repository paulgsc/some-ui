import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { LivestreamSchedule } from "."

type Story = StoryObj<typeof LivestreamSchedule>
type Meta = MetaObj<typeof LivestreamSchedule>

export const Default: Story = {
  args: {},
}

export default {
  title: "UI/Calendar/Components/LivestreamSchedule",
  component: LivestreamSchedule,
} as Meta
