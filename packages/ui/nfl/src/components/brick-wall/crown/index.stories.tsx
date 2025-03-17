import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { Crown } from "."

type Story = StoryObj<typeof Crown>
type Meta = MetaObj<typeof Crown>

export const Default: Story = {
  args: {
    x: 60,
    y: 60,
    width: 40,
    height: 30,
  },
  render: (args) => (
    <main className="size-96 border border-red-500">
      <svg viewBox="0 0 100 100" className="size-full">
        <Crown {...args} />
      </svg>
    </main>
  ),
}

export default {
  title: "UI/NFL/Components/Crown",
  component: Crown,
} as Meta
