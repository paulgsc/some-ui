import type { Meta, StoryObj } from "@storybook/react-vite"

import { ReviewPhase } from "."

const meta = {
  title: "UI/Chat/Interview/ReviewPhase",
  component: ReviewPhase,
} satisfies Meta<typeof ReviewPhase>

export default meta
type Story = StoryObj<typeof meta>

const baseArgs = {
  audioUrl: null,
  onTranscriptChange: () => {},
  onContinue: () => {},
  onRetry: () => {},
  isLastQuestion: false,
}

export const Pending: Story = {
  args: {
    ...baseArgs,
    transcription: { status: "pending" },
  },
}

export const Processing: Story = {
  args: {
    ...baseArgs,
    transcription: { status: "processing" },
  },
}

export const Done: Story = {
  args: {
    ...baseArgs,
    transcription: {
      status: "done",
      transcript:
        "I'd start by clarifying the read/write ratio and scale targets, then sketch the API surface before touching storage.",
    },
  },
}

export const Error: Story = {
  args: {
    ...baseArgs,
    transcription: {
      status: "error",
      error: "Network error: failed to transcribe recording",
    },
  },
}

export const LastQuestion: Story = {
  args: {
    ...baseArgs,
    isLastQuestion: true,
    transcription: { status: "done", transcript: "That wraps up my answer." },
  },
}
