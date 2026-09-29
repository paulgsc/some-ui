import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import { FIXTURE_BATCHES } from "@topik/components/topik/handheld/handheld-lesson/fixture"

import { WrapCard } from "."

type Story = StoryObj<typeof WrapCard>
type Meta = MetaObj<typeof WrapCard>

const noop = (): void => undefined

const meta: Meta = {
  title: "UI/Chat/Components/Topik/Handheld/WrapCard",
  component: WrapCard,
  args: {
    conversation: 0,
    conversationCount: 2,
    tally: { firstTry: 1, answered: 2, total: 2, revisited: 1 },
    lines: FIXTURE_BATCHES[0]!.messages,
    finished: false,
    short: false,
    onNextConversation: noop,
    onReplay: noop,
    onStartOver: noop,
    onChooseMaterial: noop,
  },
  // The applet owns the whole screen on a phone; Storybook's padding would
  // push its dock below the fold and misreport the layout.
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="flex h-svh w-full flex-col">
        <Story />
      </div>
    ),
  ],
}
export default meta

export const ConversationDone: Story = {}

export const MaterialComplete: Story = {
  args: { conversation: 1, finished: true },
}

export const Landscape: Story = { args: { short: true } }
