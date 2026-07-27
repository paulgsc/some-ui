import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { BorderBeam } from "."

type Story = StoryObj<typeof BorderBeam>
type Meta = MetaObj<typeof BorderBeam>

export const Default: Story = {
  args: {
    size: 16,
    duration: 8,
    color: "#333333",
    showTrail: true,
    trailColorStart: "#ffaa40",
    trailColorEnd: "#9c40ff",
    trailWidth: 2,
    trailOpacity: 0.6,
    trailFadeDuration: 4,
  },
  render: (args) => (
    <div className="bg-muted relative size-64 rounded-lg border border-gray-200">
      <BorderBeam {...args} />
    </div>
  ),
}

const meta = {
  title: "UI/Shared/Components/BorderBeam",
  component: BorderBeam,
} satisfies Meta

export default meta
