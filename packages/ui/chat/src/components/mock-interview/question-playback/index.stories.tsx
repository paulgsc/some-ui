import type { Meta, StoryObj } from "@storybook/react-vite"

import type { InterviewTTSAdapter } from "@chat/lib/interview/core/interview-types"

import { QuestionPlayback } from "."

const question = {
  id: "system-design-1",
  level: "mid" as const,
  category: "system-design" as const,
  question:
    "Design a URL shortening service like bit.ly. Consider scalability, database design, and API endpoints.",
  durationSeconds: 120,
}

const mockSupportedAdapter: InterviewTTSAdapter = {
  supported: true,
  speak: (text, opts) =>
    new Promise((resolve) => {
      opts?.onBoundary?.(Math.floor(text.length / 2), 1)
      setTimeout(resolve, 1500)
    }),
  stop: () => {},
}

const unsupportedAdapter: InterviewTTSAdapter = {
  supported: false,
  speak: async () => {},
  stop: () => {},
}

const meta = {
  title: "UI/Chat/Interview/QuestionPlayback",
  component: QuestionPlayback,
} satisfies Meta<typeof QuestionPlayback>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    question,
    questionNumber: 1,
    totalQuestions: 3,
    ttsAdapter: mockSupportedAdapter,
    onComplete: () => {},
  },
}

export const PlaybackUnsupported: Story = {
  args: {
    ...Default.args,
    ttsAdapter: unsupportedAdapter,
  },
}
