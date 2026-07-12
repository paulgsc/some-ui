import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { Segment } from "."

type Story = StoryObj<typeof Segment>
type Meta = MetaObj<typeof Segment>

export const Default: Story = {
  args: {
    className: "h-8",
  },
}

const meta = {
  title: "UI/Stepper/Components/Segment",
  component: Segment,
} satisfies Meta

export default meta
