import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { StreamingNotes } from "."

type Story = StoryObj<typeof StreamingNotes>
type Meta = MetaObj<typeof StreamingNotes>

export const Default: Story = {
  render: () => (
    <main className="size-96 bg-sky-950">
      <StreamingNotes />
    </main>
  ),
}

export default {
  title: "UI/Umag/Components/NowPlaying/StreamingNotes",
  component: StreamingNotes,
} as Meta
