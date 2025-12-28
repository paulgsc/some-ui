import { RotatingCube } from "@slideshow/components/rotating-cube"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

type Story = StoryObj<typeof RotatingCube>
type Meta = MetaObj<typeof RotatingCube>

export const Default: Story = {
  args: {
    perspective: 1250,
    dof: "Y-axis",
    className: "w-96 h-72",
  },
  render: (args) => (
    <main className="flex items-center w-full min-h-screen justify-center">
      <RotatingCube {...args} />
    </main>
  ),
}

export default {
  title: "UI/Slideshow/Components/RotatingCube",
  component: RotatingCube,
} as Meta
