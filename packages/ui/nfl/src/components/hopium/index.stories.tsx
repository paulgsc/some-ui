import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { Hopium } from "."

type Story = StoryObj<typeof Hopium>
type Meta = MetaObj<typeof Hopium>

export const Default: Story = {}

export default {
  title: "UI/NFL/Components/Hopium/Card",
  component: Hopium,
} as Meta
