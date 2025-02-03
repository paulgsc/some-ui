import { RotatingCube } from "@slideshow/components/rotating-cube"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

type Story = StoryObj<typeof RotatingCube>
type Meta = MetaObj<typeof RotatingCube>

export const Default: Story = {
  args: {
    perspective: 50,
  },
  render: (args) => (
    <main className="flex h-96 min-h-screen flex-1 items-center justify-center">
      <RotatingCube {...args} />
    </main>
  ),
}

export default {
  title: "UI/Slideshow/Components/RotatingCube",
  component: RotatingCube,
} as Meta
