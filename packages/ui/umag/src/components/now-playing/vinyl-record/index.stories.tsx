import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { VinylRecord } from "."

type Story = StoryObj<typeof VinylRecord>
type Meta = MetaObj<typeof VinylRecord>

export const Default: Story = {
  render: () => (
    <main className="size-96 bg-sky-950">
      <VinylRecord />
    </main>
  ),
}

export default {
  title: "UI/Umag/Components/NowPlaying/VinylRecord",
  component: VinylRecord,
} as Meta
