import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { Medal } from "."

type Story = StoryObj<typeof Medal>
type Meta = MetaObj<typeof Medal>

export const Default: Story = {
  args: {
    x: 40,
    y: 40,
    size: 60,
    type: "gold",
    ribbonHeight: 50,
  },

  render: (args) => (
    <main className="size-96 border border-red-500">
      <svg viewBox="0 0 100 100" className="size-full">
        <Medal {...args} />
      </svg>
    </main>
  ),
}

const meta = {
  title: "UI/NFL/Components/Medal",
  component: Medal,
} satisfies Meta

export default meta
