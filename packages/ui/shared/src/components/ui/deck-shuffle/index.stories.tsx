import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { DeckShuffle } from "."

type Story = StoryObj<typeof DeckShuffle>
type Meta = MetaObj<typeof DeckShuffle>

const contents = ["foo", "foo foo", "bar", "foo bar", "zbar"]
export const Default: Story = {
  args: {
    containerClassname: "border border-red-500",
    count: 12,
    contents,
  },
  render: (args) => (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-gray-50 font-sans">
      <DeckShuffle {...args} />
    </div>
  ),
}

const meta = {
  title: "UI/Shared/Components/DeckShuffle",
  component: DeckShuffle,
} satisfies Meta

export default meta
