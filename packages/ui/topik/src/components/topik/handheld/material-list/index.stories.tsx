import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import type { TopikMetadata } from "@topik/lib/topik"

import { MaterialList } from "."

type Story = StoryObj<typeof MaterialList>
type Meta = MetaObj<typeof MaterialList>

const noop = (): void => undefined

const lesson = (
  key: string,
  displayName: string,
  level: number,
  description: string
): TopikMetadata => ({
  key,
  displayName,
  description,
  batchCount: 3,
  totalQuestions: 6,
  totalMessages: 14,
  tags: [`topik-${level}`, "makjang"],
})

const firstDinner = lesson(
  "local:first-dinner",
  "The first family dinner",
  2,
  "Seo-yeon meets Chairman Kang, who has already decided."
)

const mine = [
  firstDinner,
  lesson(
    "local:the-will",
    "The will is read",
    3,
    "The eldest son learns the company was never his."
  ),
]

const served = [
  lesson(
    "ordering-at-a-cafe",
    "Ordering at a café",
    1,
    "Requests, politely and less so."
  ),
]

const meta: Meta = {
  title: "UI/Chat/Components/Topik/Handheld/MaterialList",
  component: MaterialList,
  args: {
    items: served,
    mine,
    loading: false,
    error: null,
    resume: null,
    onSelect: noop,
    onReload: noop,
    onCreate: noop,
    onRemove: noop,
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

export const YourLessons: Story = {}

export const Resuming: Story = {
  args: { resume: { topik: firstDinner, conversation: 1 } },
}

/** A first visit: nothing served, nothing kept. */
export const Empty: Story = { args: { items: [], mine: [] } }
