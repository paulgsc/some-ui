import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { VoiceAvatar } from "."

type Story = StoryObj<typeof VoiceAvatar>
type Meta = MetaObj<typeof VoiceAvatar>

export const Default: Story = {}

const meta = {
  title: "UI/Umag/Components/VoiceUI/Avatar",
  component: VoiceAvatar,
} satisfies Meta

export default meta
