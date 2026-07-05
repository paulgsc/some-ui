import type { Meta, StoryObj } from "@storybook/react-vite"

import { QuizIdle } from "."

const meta: Meta<typeof QuizIdle> = {
  title: "UI/Chat/Components/Topik/QuizStates/QuizIdle",
  component: QuizIdle,
  parameters: { layout: "fullscreen" },
}
export default meta
type Story = StoryObj<typeof QuizIdle>

/** Chat conversation is still playing - assessment hasn't started yet. */
export const Playing: Story = {
  args: { chatPlayState: "running" },
}

/** Chat conversation is paused, waiting for the learner to hit Play. */
export const Paused: Story = {
  args: { chatPlayState: "paused" },
}
