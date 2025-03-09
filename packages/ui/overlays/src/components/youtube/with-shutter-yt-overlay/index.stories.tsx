import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { WithLensShutterYtOverlay } from "."

type Story = StoryObj<typeof WithLensShutterYtOverlay>
type Meta = MetaObj<typeof WithLensShutterYtOverlay>

export const Default: Story = {
  render: () => (
    <main className="absolute inset-0 border border-red-500">
      <WithLensShutterYtOverlay />
    </main>
  ),
}

export default {
  title: "UI/Overlays/Youtube/WithLensOverlay",
  component: WithLensShutterYtOverlay,
} as Meta
