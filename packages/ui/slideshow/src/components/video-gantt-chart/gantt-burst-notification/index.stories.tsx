import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { GanttToast } from "."

type Story = StoryObj<typeof GanttToast>
type Meta = MetaObj<typeof GanttToast>

const notifications = [
  {
    id: 1,
    title: "New message",
    description: "You have received a new message from Sarah",
  },
  {
    id: 2,
    title: "Payment successful",
    description: "Your payment has been processed",
  },
  {
    id: 3,
    title: "Update available",
    description: "A new version is ready to install",
  },
  {
    id: 4,
    title: "Calendar reminder",
    description: "Meeting with team in 15 minutes",
  },
  {
    id: 5,
    title: "Upload complete",
    description: "Your file has been uploaded successfully",
  },
]

export const Default: Story = {
  args: {
    notifications,
    isPlaying: true,
  },
}

export default {
  title: "UI/SlideShow/Components/GanttBurstNotification",
  component: GanttToast,
} as Meta
