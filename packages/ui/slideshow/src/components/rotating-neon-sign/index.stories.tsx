import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { RotatingNeonSign } from "."

type Story = StoryObj<typeof RotatingNeonSign>
type Meta = MetaObj<typeof RotatingNeonSign>

export const Default: Story = {
  args: {
    className: "w-full max-w-xl h-32",
    faceClassName: "bg-sky-200",
    perspective: 1250,
    dof: "X-axis",
  },
  render: (args) => (
    <main className="flex h-96 min-h-screen flex-1 items-center justify-center">
      <RotatingNeonSign {...args} />
    </main>
  ),
}

const meta = {
  title: "UI/Slideshow/Components/RotatingNeonSign",
  component: RotatingNeonSign,
} satisfies Meta

export default meta
