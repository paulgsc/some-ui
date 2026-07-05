import type { ChatMessageProps } from "@chat/types/chat"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import { formatRelativeTime } from "some-ui-utils"

import { ChatMessages } from "."
import { pgdevPng } from "../../../../../../assets"

type Story = StoryObj<typeof ChatMessages>
type Meta = MetaObj<typeof ChatMessages>

const mockMessages: Array<ChatMessageProps> = Array.from(
  { length: 20 },
  (_, index) => ({
    id: `msg-${index}`,
    character: index % 2 === 0 ? "ai" : "pgdev",
    position: index % 2 === 0 ? "right" : "left",
    content: `This is message ${index + 1}`,
    type: index % 3 === 0 ? "thinking" : "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: `Avatar ${index + 1}`,
    },
  })
)

export const Default: Story = {
  args: {
    messages: mockMessages,
    className: "h-[600px] w-[400px]",
  },
  render: (args) => (
    <main className="h-[610px] w-[410px] border border-red-600">
      <ChatMessages {...args} />
    </main>
  ),
}

const meta: Meta = {
  title: "UI/Chat/Components/ChatMessages",
  component: ChatMessages,
}
export default meta
