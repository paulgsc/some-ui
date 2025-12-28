import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { OSTPanel } from "."

type Story = StoryObj<typeof OSTPanel>
type Meta = MetaObj<typeof OSTPanel>

export default {
  title: "UI/Makjang/Components/CDrama/OSTPanel",
  component: OSTPanel,
  args: {
    score: 8.7,
    ranking: 3,
    favoriteTrack: "Moonlight Echoes",
  },
} as Meta

// --- Stories --------------------------------------------------------------

export const Default: Story = {}

export const HighScore: Story = {
  args: {
    score: 9.8,
    ranking: 1,
    favoriteTrack: "Beyond the Clouds",
  },
}

export const MidScore: Story = {
  args: {
    score: 7.2,
    ranking: 12,
    favoriteTrack: "Starlit Whisper",
  },
}

export const LowScore: Story = {
  args: {
    score: 5.4,
    ranking: 27,
    favoriteTrack: "Faded Steps",
  },
}

export const RetroVibes: Story = {
  args: {
    score: 8.1,
    ranking: 5,
    favoriteTrack: "Neon Night Drive",
  },
  parameters: {
    backgrounds: {
      default: "dark",
    },
  },
}

export const EmptyTrack: Story = {
  args: {
    score: 7.5,
    ranking: 10,
    favoriteTrack: "—",
  },
}
