import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { DiceCard } from "."

type Story = StoryObj<typeof DiceCard>
type Meta = MetaObj<typeof DiceCard>

const faces = Array.from({ length: 6 }, (_, i) => (
  <span key={i} className="size-full">{`foo ${i}`}</span>
))

export const Default: Story = {
  args: {
    className: "size-40",
    faceClassName: "bg-sky-300/75",
    perspective: 1250,
    dof: "X-axis",
    faces,
  },
  render: (args) => (
    <main className="flex h-96 min-h-screen flex-1 items-center justify-center">
      <DiceCard {...args} />
    </main>
  ),
}

export default {
  title: "UI/Slideshow/Components/DiceCard",
  component: DiceCard,
} as Meta
