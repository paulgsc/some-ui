import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { SugarCube } from "."

type Story = StoryObj<typeof SugarCube>
type Meta = MetaObj<typeof SugarCube>

export const Default: Story = {
  args: {
    className: "size-72",
  },
  render: (args) => (
    <main className="absolute inset-0 flex items-center justify-center">
      <SugarCube {...args} />
    </main>
  ),
}

const meta = {
  title: "UI/Slideshow/Components/SugarCube",
  component: SugarCube,
} satisfies Meta

export default meta
