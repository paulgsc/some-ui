import type { Meta, StoryObj } from "@storybook/react-vite"

import { InterviewProgressHeader } from "."

const meta = {
  title: "UI/Chat/Interview/ProgressHeader",
  component: InterviewProgressHeader,
} satisfies Meta<typeof InterviewProgressHeader>

export default meta
type Story = StoryObj<typeof meta>

export const Question: Story = {
  args: { current: 1, total: 5, phase: "question" },
}

export const Recording: Story = {
  args: { current: 3, total: 5, phase: "recording" },
}

export const Review: Story = {
  args: { current: 5, total: 5, phase: "review" },
}
