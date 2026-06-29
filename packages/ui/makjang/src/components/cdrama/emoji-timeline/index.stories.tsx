import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { EmojiTimeline } from "."

type Story = StoryObj<typeof EmojiTimeline>
type Meta = MetaObj<typeof EmojiTimeline>

export default {
  title: "UI/Makjang/Components/CDrama/EmojiTimeline",
  component: EmojiTimeline,
  args: {
    currentMinute: 42,
    reactions: [
      { minute: 5, emoji: "🤣", context: "Silly intro hijinks" },
      { minute: 12, emoji: "😳", context: "Unexpected flirt moment" },
      { minute: 21, emoji: "💗", context: "Confession tension rising" },
      { minute: 37, emoji: "😭", context: "Flashback heartbreak" },
      { minute: 41, emoji: "🔥", context: "Peak chemistry showdown" },
    ],
  },
} satisfies Meta

// --- Stories --------------------------------------------------------------

export const Default: Story = {}

export const SparseTimeline: Story = {
  args: {
    currentMinute: 18,
    reactions: [
      { minute: 3, emoji: "😆", context: "Cute moment" },
      { minute: 17, emoji: "😱", context: "Shocking twist" },
    ],
  },
}

export const DenseTimeline: Story = {
  args: {
    currentMinute: 55,
    reactions: [
      { minute: 2, emoji: "😂", context: "Opening comedy" },
      { minute: 4, emoji: "🤣", context: "Sidekick chaos" },
      { minute: 7, emoji: "😳", context: "ML staring too long" },
      { minute: 12, emoji: "🌸", context: "Soft moment" },
      { minute: 19, emoji: "😢", context: "Tears incoming" },
      { minute: 21, emoji: "😭", context: "Actual tears" },
      { minute: 29, emoji: "🤯", context: "Twist reveal" },
      { minute: 34, emoji: "🔥", context: "Chemistry peak" },
      { minute: 48, emoji: "💀", context: "Villain move" },
      { minute: 52, emoji: "❤️", context: "Reconciliation" },
    ],
  },
}

export const NoReactions: Story = {
  args: {
    currentMinute: 25,
    reactions: [],
  },
}

export const EarlyEpisode: Story = {
  args: {
    currentMinute: 8,
    reactions: [
      { minute: 1, emoji: "🤔", context: "Setting the stage" },
      { minute: 5, emoji: "😄", context: "Silly banter" },
    ],
  },
}

export const LateEpisode: Story = {
  args: {
    currentMinute: 62,
    reactions: [
      { minute: 40, emoji: "😢", context: "Breakup scene" },
      { minute: 58, emoji: "🔥", context: "Triumphant return" },
      { minute: 60, emoji: "❤️‍🔥", context: "Kiss moment" },
    ],
  },
}

export const PeachBlossomTheme: Story = {
  parameters: {
    backgrounds: {
      default: "light",
    },
  },
  args: {
    currentMinute: 33,
    reactions: [
      { minute: 10, emoji: "🌸", context: "Blossom slow-mo walk" },
      { minute: 18, emoji: "💞", context: "Soft gaze exchange" },
      { minute: 27, emoji: "✨", context: "POV sparkle moment" },
      { minute: 32, emoji: "💓", context: "Heartbeat close-up" },
    ],
  },
}
