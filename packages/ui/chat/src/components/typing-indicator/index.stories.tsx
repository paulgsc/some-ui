import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import TypingIndicator from "."

type Story = StoryObj<typeof TypingIndicator>
type Meta = MetaObj<typeof TypingIndicator>

export const Default: Story = {}

export default {
  title: "UI/Chat/Components/TypingIndicator",
  component: TypingIndicator,
} as Meta
