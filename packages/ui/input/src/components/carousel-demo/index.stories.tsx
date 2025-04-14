import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { DiceCard } from "."

type Story = StoryObj<typeof DiceCard>
type Meta = MetaObj<typeof DiceCard>

const faceNodes = {
  item1: <div>Hello World</div>,
  item2: <button>Click Me</button>,
  item3: <img src="/api/placeholder/100/100" alt="placeholder" />,
  item4: <div className="bg-green-200 p-4">Green Box</div>,
  item5: <span className="text-red-500">Red Text</span>,
  item6: (
    <div className="flex">
      <span>⭐</span>
      <span>Rating</span>
    </div>
  ),
  item7: <input type="text" placeholder="Enter text" />,
  item8: <div className="border p-2">Bordered Box</div>,
}

export const Default: Story = {
  args: {
    className: "bg-gray-100 size-64",
    dof: "X-axis",
    faces: faceNodes,
    showBeam: false,
  },
}

export default {
  title: "UI/Input/Components/DiceCardDemo",
  component: DiceCard,
} as Meta
