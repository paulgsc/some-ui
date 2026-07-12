import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

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

const meta = {
  title: "UI/NFL/Components/Crown",
  component: Crown,
} satisfies Meta

export default meta
