import type {
  Question,
  SessionAnswer,
} from "@chat/lib/interview/core/interview-types"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { SessionComplete } from "."

const questions: Array<Question> = [
  {
    id: "system-design-1",
    level: "mid",
    category: "system-design",
    question: "Design a URL shortening service like bit.ly.",
    durationSeconds: 120,
  },
  {
    id: "behavioral-1",
    level: "mid",
    category: "behavioral",
    question: "Tell me about a time you resolved a team conflict.",
    durationSeconds: 90,
  },
]

const answers: Array<SessionAnswer> = [
  {
    questionId: "system-design-1",
    transcript: "I'd start with the read/write ratio...",
    notes: "",
    durationSeconds: 118,
  },
  {
    questionId: "behavioral-1",
    transcript: "There was a stretch where two teammates disagreed...",
    notes: "",
    durationSeconds: 76,
  },
]

const meta = {
  title: "UI/Chat/Interview/SessionComplete",
  component: SessionComplete,
} satisfies Meta<typeof SessionComplete>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    answers,
    questions,
    onRestart: () => {},
  },
}
