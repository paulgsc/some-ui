import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { MetallicBorder } from "."

type Story = StoryObj<typeof MetallicBorder>
type Meta = MetaObj<typeof MetallicBorder>

export const Default: Story = {
  render: () => (
    <svg viewBox="0 0 220 220" className="absolute inset-0 size-full">
      <MetallicBorder />
    </svg>
  ),
}

export default {
  title: "UI/NFL/Components/Cardiogram/MetallicBorder",
  component: MetallicBorder,
} as Meta
