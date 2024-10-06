import type { Meta as MetaObj, StoryObj } from "@storybook/react"
import { BarRectangleItem, DataKey } from "recharts"

import BarBackground from "."

type Meta = MetaObj<typeof BarBackground>
type Story = StoryObj<typeof BarBackground>

// Mock data for story
const mockData: ReadonlyArray<BarRectangleItem> = [
  { value: 100, background: { x: 12, y: 10, width: 100, height: 50 } },
  { value: 200, background: { x: 0, y: 60, width: 100, height: 50 } },
]

const mockDataKey: DataKey<any> = "value"

// Define the Default story
export const Default: Story = {
  render: (args) => (
    <svg width="200" height="100" className="border border-blue-300">
      <BarBackground {...args} />
    </svg>
  ),
  args: {
    data: mockData,
    dataKey: mockDataKey,
    background: { x: 0, y: 0, width: 100, height: 50 }, // Pass background props here
    onAnimationStart: () => console.log("Animation Start"),
    onAnimationEnd: () => console.log("Animation End"),
    allOtherBarProps: {
      dataKey: "value", // Add the missing dataKey property
      fill: "#2196f3",
      stroke: "#1565c0",
      strokeWidth: 2,
      onMouseEnter: (data, index) => console.log("Mouse enter", data, index),
      onMouseLeave: (data, index) => console.log("Mouse leave", data, index),
      onClick: (data, index) => console.log("Click", data, index),
    },
  },
}

// Exporting the meta information
export default {
  title: "BarBackground",
  component: BarBackground,
} as Meta
