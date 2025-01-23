import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { StyledCharacters } from "."

type Story = StoryObj<typeof StyledCharacters>
type Meta = MetaObj<typeof StyledCharacters>

export const Default: Story = {}

export default {
  title: "UI/NeonSign/StyledCharacters",
  component: StyledCharacters,
} as Meta
