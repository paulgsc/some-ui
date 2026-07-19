import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { LensShutter } from "."

type Story = StoryObj<typeof LensShutter>
type Meta = MetaObj<typeof LensShutter>

export const Default: Story = {
  args: {
    children: null,
  },
  render: (args) => (
    <main className="absolute inset-0 flex items-center justify-center border border-red-500">
      <LensShutter {...args} />
    </main>
  ),
}

const meta = {
  title: "UI/Slideshow/Components/LensShutter",
  component: LensShutter,
} satisfies Meta

export default meta
