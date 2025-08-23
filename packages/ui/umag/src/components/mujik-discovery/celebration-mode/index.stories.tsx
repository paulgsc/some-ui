import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { CelebrationOverlay } from "."

type Story = StoryObj<typeof CelebrationOverlay>
type Meta = MetaObj<typeof CelebrationOverlay>

export const Default: Story = {
  args: {},
}

export default {
  title: "UI/Umag/Components/CelebrationOverlay",
  component: CelebrationOverlay,
} as Meta
