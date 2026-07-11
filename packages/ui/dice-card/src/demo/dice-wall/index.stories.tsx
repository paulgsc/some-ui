import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { DiceWall } from "."

type Story = StoryObj<typeof DiceWall>
type Meta = MetaObj<typeof DiceWall>

const meta = {
  title: "UI/DiceCard/Showcase/DiceWall",
  component: DiceWall,
  parameters: {
    docs: {
      description: {
        component:
          "One shared clock drives every cube on the wall, but only one cube flips per tick — cards, rows, and columns take turns instead of rotating all at once. Rows rotate on the X-axis and columns on the Y-axis: rotating a wide panel around a vertical axis (or a tall one around a horizontal axis) stretches the far edge through perspective, so each shape uses whichever axis keeps its long dimension parallel to the rotation axis.",
      },
    },
  },
} satisfies Meta

export default meta

export const Default: Story = {
  render: () => (
    <main className="flex min-h-screen w-full items-center justify-center p-10">
      <DiceWall className="w-full max-w-3xl" />
    </main>
  ),
}
