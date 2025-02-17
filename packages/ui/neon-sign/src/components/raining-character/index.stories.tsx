import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { RainingCharacter } from "."

type Story = StoryObj<typeof RainingCharacter>
type Meta = MetaObj<typeof RainingCharacter>

export const Default: Story = {}

export default {
  title: "UI/NeonSign/Components/RainingCharacter",
  component: RainingCharacter,
} as Meta
