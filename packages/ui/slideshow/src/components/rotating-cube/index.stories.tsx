import RotatingCube from "@slideshow/components/rotating-cube"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

type Story = StoryObj<typeof RotatingCube>
type Meta = MetaObj<typeof RotatingCube>

export const Default: Story = {
  render: () => (
    <main className="flex h-96 min-h-screen flex-1 items-center justify-center">
      <RotatingCube />
    </main>
  ),
}

export default {
  title: "UI/Slideshow/Components/RotatingCube",
  component: RotatingCube,
} as Meta
