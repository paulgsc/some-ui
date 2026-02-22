import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { FramerToast } from "."

type Story = StoryObj<typeof FramerToast>
type Meta = MetaObj<typeof FramerToast>

export const Default: Story = {
  args: {
    title: "New message",
    description: "You have received a new message from Sarah",
  },
}

export default {
  title: "UI/SlideShow/Components/FramerToast",
  component: FramerToast,
} as Meta
