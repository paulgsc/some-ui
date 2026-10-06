import type { Meta, StoryObj } from "@storybook/react-vite"

import { QuizFeedback } from "."

const meta: Meta<typeof QuizFeedback> = {
  title: "UI/Chat/Components/Topik/QuizStates/QuizFeedback",
  component: QuizFeedback,
  parameters: { layout: "fullscreen" },
  argTypes: {
    onNextQuestion: { action: "onNextQuestion" },
  },
}
export default meta
type Story = StoryObj<typeof QuizFeedback>

/** Text-input question, answered incorrectly - shows the user's answer next to the correct one. */
export const IncorrectTextInput: Story = {
  args: {
    isCorrect: false,
    questionNumber: 4,
    totalQuestions: 5,
    questionType: "text-input",
    userAnswer: "goodbye",
    correctAnswer: "thank you",
    explanation: "감사합니다 is a formal way to say thank you.",
    grammarNote: "The 습니다 ending marks formal speech.",
  },
}
