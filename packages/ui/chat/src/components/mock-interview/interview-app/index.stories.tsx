import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { InterviewApp } from "."

type Story = StoryObj<typeof InterviewApp>
type Meta = MetaObj<typeof InterviewApp>

export const Default: Story = {}

export default {
  title: "UI/Chat/Interview/InterviewApp",
  component: InterviewApp,
} satisfies Meta
