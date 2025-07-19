import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { ChatMessage } from "."
import type { ChatMessageProps } from "@chat/types/chat"

type Story = StoryObj<typeof ChatMessage>
type Meta = MetaObj<typeof ChatMessage>

const avatar = {
  src: "https://github.com/shadcn.png",
  alt: "@shadcn",
  fallback: "CN",
}

const message: ChatMessageProps = {
  id: "1",
  character: "ai",
  position: "right",
  content: "👋 Hi there! How can I help?",
  type: "chat",
  timestamp: "Just now",
  avatar,
}

export const Default: Story = {
  args: {
    ...message,
  },
}

export default {
  title: "UI/Chat/Components/ChatMessage",
  component: ChatMessage,
} as Meta
