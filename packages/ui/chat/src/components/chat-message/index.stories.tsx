import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { ChatMessage } from "."
import type { Options } from "."

type Story = StoryObj<typeof ChatMessage>
type Meta = MetaObj<typeof ChatMessage>

const message: Options = {
  id: "1",
  character: "ai",
  content: "👋 Hi there! How can I help?",
  type: "chat",
  timestamp: "Just now",
}

export const Default: Story = {
  args: {
    message,
  },
}

export default {
  title: "UI/Chat/Components/ChatMessage",
  component: ChatMessage,
} as Meta
