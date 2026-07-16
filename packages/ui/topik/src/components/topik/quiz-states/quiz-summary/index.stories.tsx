import type { Meta, StoryObj } from "@storybook/react-vite"

import { QuizSummary } from "."

const meta: Meta<typeof QuizSummary> = {
  title: "UI/Chat/Components/Topik/QuizStates/QuizSummary",
  component: QuizSummary,
  parameters: { layout: "fullscreen" },
  argTypes: {
    onAssessmentComplete: { action: "onAssessmentComplete" },
  },
}
export default meta
type Story = StoryObj<typeof QuizSummary>

/** 80%+ - "Advanced" tier, passed. */
export const Advanced: Story = {
  args: { score: 9, totalQuestions: 10 },
}

/** 70-79% - "Intermediate" tier, passed. */
export const Intermediate: Story = {
  args: { score: 7, totalQuestions: 10 },
}

/** Below 70% - "Beginner" tier, failed, prompts a retry. */
export const Failed: Story = {
  args: { score: 4, totalQuestions: 10 },
}
