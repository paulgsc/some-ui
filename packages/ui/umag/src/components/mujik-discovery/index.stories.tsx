import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { MusicDiscoveryButton } from "."

type Story = StoryObj<typeof MusicDiscoveryButton>
type Meta = MetaObj<typeof MusicDiscoveryButton>

export const Default: Story = {
  args: {
    songTitle: "Strawberry Moon",
    artist: "IU",
  },
}

export default {
  title: "UI/Umag/Components/MusicDiscoveryButton",
  component: MusicDiscoveryButton,
} as Meta
