import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { Brick } from "."

type Story = StoryObj<typeof Brick>
type Meta = MetaObj<typeof Brick>

export const Default: Story = {
  args: {
    brick: {
      position: {
        x: 0,
        y: 0,
        width: 80,
        height: 80,
      },
      item: {
        name: "49ers",
        value: 11,
      },
      color_intensity: 5,
    },
  },
  render: (args) => (
    <main className="size-96 border border-red-500">
      <svg viewBox="0 0 100 100" className="size-full">
        <Brick {...args} />
      </svg>
    </main>
  ),
}

export default {
  title: "UI/NFL/Components/Brick",
  component: Brick,
} as Meta
