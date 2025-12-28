import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { DramaHeader } from "."

type Story = StoryObj<typeof DramaHeader>
type Meta = MetaObj<typeof DramaHeader>

const meta: Meta = {
  title: "UI/Makjang/Components/CDrama/DramaHeader",
  component: DramaHeader,
  args: {
    dramaId: "crash-landing-on-you",
    episodeNumber: 8,
    thumbnailUrl:
      "https://images.unsplash.com/photo-1522120692238-6bcb1bbd1a66?q=80&w=800&auto=format&fit=crop",
    currentMinute: 12,
  },
  parameters: {
    layout: "centered",
  },
}

export default meta

/**
 * Base state — mid-episode, some progress,
 * mounted animation + hover effects visible.
 */
export const Default: Story = {}

/**
 * Near the beginning of the episode.
 * Useful for validating progress bar edge cases.
 */
export const JustStarted: Story = {
  args: {
    currentMinute: 1,
  },
}

/**
 * Almost finished — progress bar should be nearly full.
 */
export const NearEnd: Story = {
  args: {
    currentMinute: 44,
  },
}

/**
 * Episode one, clean slate vibes.
 */
export const PremiereEpisode: Story = {
  args: {
    episodeNumber: 1,
    currentMinute: 0,
  },
}

/**
 * Long, messy slug to ensure title formatting
 * and line-breaking stay tasteful.
 */
export const LongDramaTitle: Story = {
  args: {
    dramaId: "the-unbearably-long-and-emotionally-devastating-makjang-saga",
  },
}

/**
 * Missing thumbnail — forces fallback image usage.
 */
export const NoThumbnail: Story = {
  args: {
    thumbnailUrl: "",
  },
}
