import { interviewQuestions } from "@interview/data/interview-questions"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { InterviewApp } from "."

type Story = StoryObj<typeof InterviewApp>
type Meta = MetaObj<typeof InterviewApp>

export const Default: Story = {
  args: {
    interviewQuestions,
  },
}

const meta: Meta = {
  title: "UI/Chat/Interview/InterviewApp",
  component: InterviewApp,
}
export default meta
