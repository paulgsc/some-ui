import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { EmotionalGraph } from "."

type Story = StoryObj<typeof EmotionalGraph>
type Meta = MetaObj<typeof EmotionalGraph>

export default {
  title: "UI/Makjang/Components/CDrama/EmotionalGraph",
  component: EmotionalGraph,
  args: {
    currentMinute: 32,
    data: [
      {
        minute: 3,
        emotion: "neutral",
        intensity: 0.2,
        notes: "Setting the mood",
      },
      { minute: 7, emotion: "joy", intensity: 0.5, notes: "Cute interaction" },
      {
        minute: 12,
        emotion: "surprise",
        intensity: 0.6,
        notes: "Unexpected reveal",
      },
      {
        minute: 18,
        emotion: "sadness",
        intensity: 0.4,
        notes: "Flashback moment",
      },
      { minute: 27, emotion: "anger", intensity: 0.7, notes: "Argument scene" },
      {
        minute: 29,
        emotion: "joy",
        intensity: 0.8,
        notes: "Romantic breakthrough",
      },
      {
        minute: 31,
        emotion: "fear",
        intensity: 0.6,
        notes: "Dark hallway tension",
      },
    ],
  },
} satisfies Meta

// --- Stories --------------------------------------------------------------

export const Default: Story = {}

export const JoyFocus: Story = {
  args: {
    currentMinute: 20,
    data: [
      { minute: 2, emotion: "joy", intensity: 3, notes: "Warm opening" },
      { minute: 6, emotion: "joy", intensity: 6, notes: "Blossom walk" },
      { minute: 14, emotion: "joy", intensity: 8, notes: "Soft banter" },
      { minute: 19, emotion: "joy", intensity: 9, notes: "Peak heart flutter" },
    ],
  },
}

export const AngstHeavy: Story = {
  args: {
    currentMinute: 41,
    data: [
      { minute: 5, emotion: "sadness", intensity: 4, notes: "Past regret" },
      {
        minute: 17,
        emotion: "sadness",
        intensity: 7,
        notes: "Tearful confession",
      },
      {
        minute: 28,
        emotion: "fear",
        intensity: 6,
        notes: "Emotional distance",
      },
      {
        minute: 39,
        emotion: "anger",
        intensity: 8,
        notes: "Heated misunderstanding",
      },
      {
        minute: 40,
        emotion: "sadness",
        intensity: 9,
        notes: "Breakdown moment",
      },
    ],
  },
}

export const HighIntensityEpisode: Story = {
  args: {
    currentMinute: 55,
    data: [
      {
        minute: 3,
        emotion: "surprise",
        intensity: 0.9,
        notes: "Cold open twist",
      },
      {
        minute: 11,
        emotion: "anger",
        intensity: 0.8,
        notes: "Rival confrontation",
      },
      { minute: 22, emotion: "fear", intensity: 0.95, notes: "Chase sequence" },
      { minute: 36, emotion: "joy", intensity: 0.9, notes: "Reunion lift" },
      {
        minute: 49,
        emotion: "disgust",
        intensity: 0.7,
        notes: "Villain reveal",
      },
    ],
  },
}

export const NoData: Story = {
  args: {
    currentMinute: 15,
    data: [],
  },
}

export const EarlyEpisode: Story = {
  args: {
    currentMinute: 6,
    data: [
      { minute: 1, emotion: "neutral", intensity: 1, notes: "Opening shot" },
      {
        minute: 4,
        emotion: "surprise",
        intensity: 3,
        notes: "Unexpected cameo",
      },
    ],
  },
}

export const LateEpisode: Story = {
  args: {
    currentMinute: 58,
    data: [
      { minute: 40, emotion: "sadness", intensity: 6, notes: "Climax fallout" },
      {
        minute: 52,
        emotion: "anger",
        intensity: 7,
        notes: "Final confrontation",
      },
      { minute: 55, emotion: "joy", intensity: 9, notes: "Resolution moment" },
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
    currentMinute: 25,
    data: [
      { minute: 3, emotion: "joy", intensity: 5, notes: "Petal slow-mo" },
      {
        minute: 10,
        emotion: "surprise",
        intensity: 6,
        notes: "Unexpected gaze",
      },
      { minute: 17, emotion: "joy", intensity: 8, notes: "Hand brush moment" },
      {
        minute: 23,
        emotion: "neutral",
        intensity: 2,
        notes: "Walking under blossoms",
      },
    ],
  },
}

export const ChaosMode: Story = {
  args: {
    currentMinute: 45,
    data: [
      { minute: 5, emotion: "joy", intensity: 7, notes: "Cute chaos" },
      { minute: 9, emotion: "fear", intensity: 8, notes: "Sudden dark turn" },
      {
        minute: 15,
        emotion: "surprise",
        intensity: 10,
        notes: "Unhinged twist",
      },
      { minute: 21, emotion: "anger", intensity: 7, notes: "Screaming match" },
      {
        minute: 26,
        emotion: "disgust",
        intensity: 9,
        notes: "Gross revelation",
      },
      {
        minute: 33,
        emotion: "joy",
        intensity: 10,
        notes: "Fanservice rebound",
      },
      {
        minute: 42,
        emotion: "sadness",
        intensity: 8,
        notes: "Tragic pre-ending",
      },
    ],
  },
}
