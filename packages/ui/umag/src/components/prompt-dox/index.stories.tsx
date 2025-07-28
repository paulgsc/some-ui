import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { DoxPrompt } from "."

type Story = StoryObj<typeof DoxPrompt>
type Meta = MetaObj<typeof DoxPrompt>

export const Default: Story = {
  args: {
    className: "fixed end-2 bottom-12",
    showErrorFallback: true,
  },
}

export default {
  title: "UI/Umag/Components/DoxPrompt",
  component: DoxPrompt,
} as Meta
