import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { SongInfo } from "."

type Story = StoryObj<typeof SongInfo>
type Meta = MetaObj<typeof SongInfo>

export const Default: Story = {
  render: () => (
    <main className="size-96 bg-sky-950">
      <SongInfo />
    </main>
  ),
}

const meta = {
  title: "UI/Umag/Components/NowPlaying/SongInfo",
  component: SongInfo,
} satisfies Meta

export default meta
