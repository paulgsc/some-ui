import type { Message } from "@chat/types/chat"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import { formatRelativeTime } from "some-ui-utils"

import { ChatMessages } from "."
// Relative, not "@some-ui/*"-aliased: chat's tsconfig maps that prefix to
// the repo-root assets/ package, but the specifier also happens to look
// like a real scoped npm package (@some-ui/core-utils and friends really
// exist), which trips import/no-extraneous-dependencies into demanding a
// "some-ui" package.json dependency that makes no sense to add.
// eslint-disable-next-line no-restricted-imports -- see comment above
import { pgdevPng } from "../../../../../../assets"

type Story = StoryObj<typeof ChatMessages>
type Meta = MetaObj<typeof ChatMessages>

const mockMessages: Array<Message> = Array.from({ length: 20 }, (_, index) => ({
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
}))

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
