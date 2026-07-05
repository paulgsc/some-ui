import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import TypingIndicator from "."

type Story = StoryObj<typeof TypingIndicator>
type Meta = MetaObj<typeof TypingIndicator>

export const Default: Story = {}

const meta: Meta = {
  title: "UI/Chat/Components/TypingIndicator",
  component: TypingIndicator,
}
export default meta
