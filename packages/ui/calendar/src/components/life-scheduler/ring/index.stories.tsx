import type { Meta, StoryObj } from "@storybook/react-vite"

import type { RingHit } from "."
import { Rings } from "."

const meta: Meta<typeof Rings> = {
  title: "UI/Calendar/Scheduler/Components/Rings",
  component: Rings,
  parameters: {
    layout: "centered",
    // Setting a dark background in Storybook to match your component's aesthetic
    backgrounds: {
      default: "dark",
      values: [{ name: "dark", value: "#121110" }],
    },
  },
  tags: ["autodocs"],
  argTypes: {
    outerPos: {
      control: { type: "range", min: 0, max: 23, step: 1 },
      description: "Position on the outer ring (0-23)",
    },
    innerPos: {
      control: { type: "range", min: 0, max: 59, step: 1 },
      description: "Position on the inner ring (0-59)",
    },
    onHit: { action: "ring-clicked" },
  },
}

export default meta
type Story = StoryObj<typeof Rings>

/**
 * The default interactive state of the Rings component.
 */
export const Default: Story = {
  args: {
    outerPos: 10,
    innerPos: 45,
    onHit: (hit: RingHit) => console.log("Hit captured:", hit),
  },
}

/**
 * Demonstrating the "Active" start position (Midnight/Zero).
 */
export const Origin: Story = {
  args: {
    outerPos: 0,
    innerPos: 0,
  },
}

/**
 * A "Full" state showing higher values on both tracks.
 */
export const HighValues: Story = {
  args: {
    outerPos: 23,
    innerPos: 59,
  },
}

/**
 * This variation places the component in a constrained width container
 * to test the Tailwind responsive scaling.
 */
export const ResponsiveTest: Story = {
  render: (args) => (
    <div className="w-[300px] border border-dashed border-white/20 p-4">
      <Rings {...args} />
      <p className="text-[#6b6865] text-center text-xs mt-2">
        Scales to fit container width
      </p>
    </div>
  ),
  args: {
    outerPos: 12,
    innerPos: 30,
  },
}
