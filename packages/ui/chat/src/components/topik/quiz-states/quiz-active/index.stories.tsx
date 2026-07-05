import type { Meta, StoryObj } from "@storybook/react-vite"

import { QuizActive } from "."

const meta: Meta<typeof QuizActive> = {
  title: "UI/Chat/Components/Topik/QuizStates/QuizActive",
  component: QuizActive,
  parameters: { layout: "fullscreen" },
  argTypes: {
    onSpeakMessage: { action: "onSpeakMessage" },
    onAnswerSubmit: { action: "onAnswerSubmit" },
  },
}
export default meta
type Story = StoryObj<typeof QuizActive>

/** Multiple-choice question with Korean context and TTS playback. */
export const MultipleChoice: Story = {
  args: {
    questionNumber: 1,
    totalQuestions: 5,
    isSpeaking: false,
    question: {
      type: "multiple-choice",
      korean: "안녕하세요",
      question: "What does this greeting mean?",
      options: ["Hello", "Goodbye", "Thank you"],
      correct: 0,
      correctAnswer: "Hello",
      explanation: "It's a standard greeting used any time of day.",
    },
  },
}

/** Free-text translation question. */
export const TextInput: Story = {
  args: {
    questionNumber: 3,
    totalQuestions: 5,
    isSpeaking: false,
    question: {
      type: "text-input",
      korean: "감사합니다",
      question: "Translate this phrase.",
      acceptedAnswers: ["thank you", "thanks"],
      correctAnswer: "thank you",
      explanation: "A common, polite phrase of gratitude.",
    },
  },
}

/** The speak button is disabled while audio is already playing. */
export const Speaking: Story = {
  args: {
    ...MultipleChoice.args,
    isSpeaking: true,
  },
}
