import type { Meta, StoryObj } from "@storybook/react-vite"

import { QuizReady } from "."

const meta: Meta<typeof QuizReady> = {
  title: "UI/Chat/Components/Topik/QuizStates/QuizReady",
  component: QuizReady,
  parameters: { layout: "fullscreen" },
  argTypes: {
    onStartQuiz: { action: "onStartQuiz" },
  },
}
export default meta
type Story = StoryObj<typeof QuizReady>

export const Default: Story = {}
