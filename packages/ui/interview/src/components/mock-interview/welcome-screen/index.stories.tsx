import type { Meta, StoryObj } from "@storybook/react-vite"

import { WelcomeScreen } from "."

const meta = {
  title: "UI/Chat/Interview/WelcomeScreen",
  component: WelcomeScreen,
} satisfies Meta<typeof WelcomeScreen>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    onStart: () => {},
  },
}

export const ResumeAvailable: Story = {
  args: {
    onStart: () => {},
    resumeAvailable: true,
    onResume: () => {},
    onDiscardResume: () => {},
  },
}
