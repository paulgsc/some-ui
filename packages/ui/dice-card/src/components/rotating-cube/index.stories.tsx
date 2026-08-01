import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import { Card } from "@some-ui/shared"

import { RotatingCube } from "."

type Story = StoryObj<typeof RotatingCube>
type Meta = MetaObj<typeof RotatingCube>

// --- Stories ---

const meta = {
  title: "UI/DiceCard/Components/RotatingCube",
  component: RotatingCube,
} satisfies Meta

export default meta

export const Default: Story = {
  args: {
    perspective: 1250,
    dof: "Y-axis",
    className: "w-96 h-72",
    content: [
      <Card
        key="face-1"
        className="flex size-full items-center justify-center p-4 text-center"
      >
        Face one — legacy wrapper around DiceCard
      </Card>,
      <Card
        key="face-2"
        className="flex size-full items-center justify-center p-4 text-center"
      >
        Face two
      </Card>,
      <Card
        key="face-3"
        className="flex size-full items-center justify-center p-4 text-center"
      >
        Face three
      </Card>,
      <Card
        key="face-4"
        className="flex size-full items-center justify-center p-4 text-center"
      >
        Face four
      </Card>,
    ],
  },
  render: (args) => (
    <main className="flex items-center w-full min-h-screen justify-center">
      <RotatingCube {...args} />
    </main>
  ),
}

export const SimpleColors: Story = {
  args: {
    ...Default.args,
    content: [
      <div
        key="id_1"
        className="bg-red-500 size-full flex items-center justify-center text-white"
      >
        Face 1
      </div>,
      <div
        key="id_2"
        className="bg-blue-500 size-full flex items-center justify-center text-white"
      >
        Face 2
      </div>,
      <div
        key="id_3"
        className="bg-green-500 size-full flex items-center justify-center text-white"
      >
        Face 3
      </div>,
      <div
        key="id_4"
        className="bg-yellow-500 size-full flex items-center justify-center text-white"
      >
        Face 4
      </div>,
    ],
  },
}
