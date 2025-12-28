import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { NowPlayingCard } from "."

type Story = StoryObj<typeof NowPlayingCard>
type Meta = MetaObj<typeof NowPlayingCard>

export const Default: Story = {
  args: {
    className: "size-full",
  },
  render: (args) => (
    <main className="strawberry-moon h-48 w-96 rounded-full">
      <NowPlayingCard {...args} />
    </main>
  ),
}

export default {
  title: "UI/Umag/Components/NowPlaying/NowPlayingCard",
  component: NowPlayingCard,
} as Meta
