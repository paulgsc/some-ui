import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import SplayTreeAnimation from "."

type Story = StoryObj<typeof SplayTreeAnimation>
type Meta = MetaObj<typeof SplayTreeAnimation>

export const Default: Story = {}

export default {
  title: "Overlays/Youtube/SplayTree/Animated",
  component: SplayTreeAnimation,
} as Meta
