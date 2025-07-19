import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { Segment, Segments } from "."

type Story = StoryObj<typeof Segments>
type Meta = MetaObj<typeof Segments>

export const Default: Story = {
  args: {
    segmentMarkerPosition: 75,
  },
  render: (args) => (
    <Segments {...args}>
      {Array.from({ length: 5 }, (_, i) => (
        <Segment key={i} segmentWidth={20} />
      ))}
    </Segments>
  ),
}

export default {
  title: "UI/Stepper/Components/Segments",
  component: Segments,
} as Meta
