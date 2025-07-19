import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { StyledCharacters } from "."

type Story = StoryObj<typeof StyledCharacters>
type Meta = MetaObj<typeof StyledCharacters>

export const Default: Story = {
  args: {
    text: "foo foo foo!",
  },
}

export default {
  title: "UI/NeonSign/StyledCharacters",
  component: StyledCharacters,
} as Meta
