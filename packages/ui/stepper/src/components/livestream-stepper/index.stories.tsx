import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { LivestreamTopicNotification } from "."

type Story = StoryObj<typeof LivestreamTopicNotification>
type Meta = MetaObj<typeof LivestreamTopicNotification>

export const Default: Story = {
  args: {
    speechIntervalLoops: 1,
  },
}

const meta = {
  title: "UI/Stepper/Components/LivestreamTopicNotification",
  component: LivestreamTopicNotification,
} satisfies Meta

export default meta
