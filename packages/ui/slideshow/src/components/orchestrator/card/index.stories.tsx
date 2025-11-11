import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { OrchestratorDemo } from "."

type Story = StoryObj<typeof OrchestratorDemo>
type Meta = MetaObj<typeof OrchestratorDemo>

export const Default: Story = {
  args: {},
}

export default {
  title: "UI/Slideshow/Components/Ochestrator/OrchestratorDemo",
  component: OrchestratorDemo,
} as Meta
