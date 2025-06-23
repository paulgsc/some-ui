import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { NowPlayingCard } from "."

type Story = StoryObj<typeof NowPlayingCard>
type Meta = MetaObj<typeof NowPlayingCard>

export const Default: Story = {}

export default {
  title: "UI/Umag/Components/NowPlayingCard",
  component: NowPlayingCard,
} as Meta
