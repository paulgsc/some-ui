import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import BoredEmoji from "."

type Meta = MetaObj<typeof BoredEmoji>
type Story = StoryObj<typeof BoredEmoji>

export default {
  title: "Animations/Components/Bored Emoji",
  component: BoredEmoji,
} as Meta

export const Complete: Story = {
  args: {
    isSleeping: true,
  },
}
