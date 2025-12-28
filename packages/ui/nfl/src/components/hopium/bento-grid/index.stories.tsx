import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { BentoWireframe } from "."

type Story = StoryObj<typeof BentoWireframe>
type Meta = MetaObj<typeof BentoWireframe>

export const Default: Story = {}

export default {
  title: "UI/NFL/Components/Hopium/BentoWireframe",
  component: BentoWireframe,
} as Meta
