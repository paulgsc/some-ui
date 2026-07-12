import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { BentoWireframe } from "."

type Story = StoryObj<typeof BentoWireframe>
type Meta = MetaObj<typeof BentoWireframe>

export const Default: Story = {}

const meta = {
  title: "UI/NFL/Components/Hopium/BentoWireframe",
  component: BentoWireframe,
} satisfies Meta

export default meta
