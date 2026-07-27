import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { PolarSphere } from "."

type Story = StoryObj<typeof PolarSphere>
type Meta = MetaObj<typeof PolarSphere>

export const Default: Story = {
  args: {
    polarity: 3,
  },
}

const meta = {
  title: "UI/Shared/Components/PolarSphere",
  component: PolarSphere,
} satisfies Meta

export default meta
