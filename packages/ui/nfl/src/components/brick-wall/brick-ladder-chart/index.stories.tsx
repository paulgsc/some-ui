import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { BrickLadderChart } from "."

type Story = StoryObj<typeof BrickLadderChart>
type Meta = MetaObj<typeof BrickLadderChart>

const data = [
  { name: "Eagles", value: 11 },
  { name: "Patriots", value: 9 },
  { name: "Rams", value: 8 },
  { name: "Chiefs", value: 7 },
  { name: "Cowboys", value: 7 },
  { name: "Dolphins", value: 6 },
  { name: "Bengals", value: 6 },
  { name: "Raiders", value: 6 },
  { name: "Steelers", value: 5 },
  { name: "Browns", value: 5 },
  { name: "Jets", value: 5 },
  { name: "Lions", value: 4 },
  { name: "Bears", value: 4 },
  { name: "Packers", value: 4 },
  { name: "Texans", value: 3 },
]

export const Default: Story = {
  args: {
    data,
  },
  render: (args) => (
    <main className="absolute inset-0 border border-red-500">
      <BrickLadderChart {...args} />
    </main>
  ),
}

export default {
  title: "UI/NFL/Components/BrickChart",
  component: BrickLadderChart,
} as Meta
