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

const meta = {
  title: "UI/SlideShow/Components/FramerToast",
  component: FramerToast,
} satisfies Meta

export default meta
