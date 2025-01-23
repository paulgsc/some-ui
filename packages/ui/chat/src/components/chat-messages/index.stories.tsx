import type { Options as ChatMessageOptions } from "@chat/components/chat-message"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"
import { formatRelativeTime } from "some-ui-utils"

import { ChatMessages } from "."

type Story = StoryObj<typeof ChatMessages>
type Meta = MetaObj<typeof ChatMessages>

const mockMessages: Array<ChatMessageOptions> = Array.from(
  { length: 20 },
  (_, index) => ({
    id: `msg-${index}`,
    character: index % 2 === 0 ? "ai" : "pgdev",
    content: `This is message ${index + 1}`,
    type: index % 3 === 0 ? "thinking" : "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: `/avatars/avatar-${index % 5}.png`,
      alt: `Avatar ${index + 1}`,
    },
  })
)

export const Default: Story = {
  args: {
    messages: mockMessages,
  },
}

export default {
  title: "UI/Chat/Components/ChatMessages",
  component: ChatMessages,
} as Meta
