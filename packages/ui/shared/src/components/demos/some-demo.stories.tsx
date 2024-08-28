import type { Meta, StoryObj } from "@storybook/react"

import {
  createRect,
  createRectFromNodes,
  createRectFromPoints,
  type Node,
} from "./rect-utils"
import RectDemo from "./some-demo"

export default {
  title: "Components/RectDemo",
  component: RectDemo,
} as Meta

type Story = StoryObj<typeof RectDemo>

// type RectFromNodesStory = StoryObj<typeof RectFromNodes>

// type RectFromPoints = StoryObj<typeof RectFromPoints>

export const Manual: Story = {
  args: {
    rect: createRect(0, 0, 200, 100),
  },
}

export const FromPoints: Story = {
  args: {
    rect: createRectFromPoints({ x: 50, y: 50 }, { x: 250, y: 200 }),
  },
}

const nodes: Array<Node> = [
  { id: "1", position: { x: 10, y: 50 } },
  { id: "2", position: { x: 100, y: 50 } },
  { id: "3", position: { x: 50, y: 100 } },
]

export const FromNodes: Story = {
  args: {
    rect: createRectFromNodes(nodes),
    nodes: nodes,
  },
}
