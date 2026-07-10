import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { VinylRecord } from "."

type Story = StoryObj<typeof VinylRecord>
type Meta = MetaObj<typeof VinylRecord>

export const Default: Story = {
  render: () => (
    <main className="size-96 bg-sky-950">
      <VinylRecord onConnect={() => {}} />
    </main>
  ),
}

const meta = {
  title: "UI/Umag/Components/NowPlaying/VinylRecord",
  component: VinylRecord,
} satisfies Meta

export default meta
