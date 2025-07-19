import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { Segment } from "."

type Story = StoryObj<typeof Segment>
type Meta = MetaObj<typeof Segment>

export const Default: Story = {
  args: {
    className: "h-8",
  },
}

export default {
  title: "UI/Stepper/Components/Segment",
  component: Segment,
} as Meta
