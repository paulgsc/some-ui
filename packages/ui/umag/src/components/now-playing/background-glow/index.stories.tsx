import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { BackgroundGlow } from "."

type Story = StoryObj<typeof BackgroundGlow>
type Meta = MetaObj<typeof BackgroundGlow>

export const Default: Story = {}

export default {
  title: "UI/Umag/Components/NowPlaying/BackgroundGlow",
  component: BackgroundGlow,
} as Meta
