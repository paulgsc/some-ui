import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { BackgroundGlow } from "."

type Story = StoryObj<typeof BackgroundGlow>
type Meta = MetaObj<typeof BackgroundGlow>

export const Default: Story = {}

const meta = {
  title: "UI/Umag/Components/NowPlaying/BackgroundGlow",
  component: BackgroundGlow,
} satisfies Meta

export default meta
