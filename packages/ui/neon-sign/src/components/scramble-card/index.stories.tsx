import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { ScrambledCard } from "."

type Story = StoryObj<typeof ScrambledCard>
type Meta = MetaObj<typeof ScrambledCard>

export const Default: Story = {
  args: {
    className: "size-96 bg-white",
  },
  render: (args) => (
    <main className="bg-black size-200 flex items-center justify-center">
      <ScrambledCard {...args} />
    </main>
  ),
}

export default {
  title: "UI/NeonSign/Components/ScrambledCard",
  component: ScrambledCard,
} as Meta
