import { mockMessages } from "@chat/data/chat-messages"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { ChatInterface } from "."

type Story = StoryObj<typeof ChatInterface>
type Meta = MetaObj<typeof ChatInterface>

const characters = [
  {
    src: "https://github.com/shadcn.png",
    alt: "@shadcn",
    fallback: "CN",
  },
  {
    src: "https://github.com/openai.png",
    alt: "@openai",
    fallback: "AI",
  },
]

export const Default: Story = {
  args: {
    messages: mockMessages,
    className: "w-full max-w-sm h-[700px]",
    characters,
  },
}

export default {
  title: "UI/Chat/Components/ChatInterface",
  component: ChatInterface,
} as Meta
