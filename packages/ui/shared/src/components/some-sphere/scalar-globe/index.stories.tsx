import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { PolarSphere } from "."

type Story = StoryObj<typeof PolarSphere>
type Meta = MetaObj<typeof PolarSphere>

export const Default: Story = {
  args: {
    polarity: 3,
  },
}

export default {
  title: "UI/Shared/Components/PolarSphere",
  component: PolarSphere,
} as Meta
