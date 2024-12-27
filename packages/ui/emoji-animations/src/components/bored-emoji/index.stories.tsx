import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import BoredEmoji from "."

type Meta = MetaObj<typeof BoredEmoji>
type Story = StoryObj<typeof BoredEmoji>

export default {
  title: "NFL Standings",
  component: BoredEmoji,
} as Meta

export const Complete: Story = {}
