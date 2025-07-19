import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { SugarCubesStack } from "."

type Story = StoryObj<typeof SugarCubesStack>
type Meta = MetaObj<typeof SugarCubesStack>

export const Default: Story = {
  args: {
    className: "size-250",
  },
  render: (args) => (
    <main className="absolute inset-0 flex items-center justify-center">
      <SugarCubesStack {...args} />
    </main>
  ),
}

export default {
  title: "UI/Slideshow/Components/SugarCubesStack",
  component: SugarCubesStack,
} as Meta
