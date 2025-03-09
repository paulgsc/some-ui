import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { LensShutter } from "."

type Story = StoryObj<typeof LensShutter>
type Meta = MetaObj<typeof LensShutter>

export const Default: Story = {
  render: () => (
    <main className="absolute inset-0 flex items-center justify-center border border-red-500">
      <LensShutter />
    </main>
  ),
}

export default {
  title: "UI/Slideshow/Components/LensShutter",
  component: LensShutter,
} as Meta
