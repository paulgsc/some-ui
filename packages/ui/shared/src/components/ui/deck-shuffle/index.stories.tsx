import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { DeckShuffle } from "."

type Story = StoryObj<typeof DeckShuffle>
type Meta = MetaObj<typeof DeckShuffle>

export const Default: Story = {
  args: {
    containerClassname: "border border-red-500",
    count: 12,
  },
  render: (args) => (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-gray-50 font-sans">
      <DeckShuffle {...args} />
    </div>
  ),
}

export default {
  title: "UI/Shared/Components/DeckShuffle",
  component: DeckShuffle,
} as Meta
