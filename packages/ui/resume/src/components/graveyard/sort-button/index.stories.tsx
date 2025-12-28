import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { SortButton } from "."

type Story = StoryObj<typeof SortButton>
type Meta = MetaObj<typeof SortButton>

export const Default: Story = {}

export default {
  title: "UI/Resume/Components/Graveyard/SortButton",
  component: SortButton,
} as Meta
