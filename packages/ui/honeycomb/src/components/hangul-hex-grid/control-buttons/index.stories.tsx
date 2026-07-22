import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "storybook/test"

import { ControlButtons } from "."

const meta: Meta<typeof ControlButtons> = {
  title: "UI/Honeycomb/Hangul/Components/ControlButtons",
  component: ControlButtons,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="relative h-40 w-full bg-slate-900">
        <Story />
      </div>
    ),
  ],
  args: {
    onTogglePause: fn(),
    onReset: fn(),
  },
} satisfies Meta<typeof ControlButtons>

export default meta
type Story = StoryObj<typeof meta>

export const Playing: Story = {
  args: { isPaused: false },
}

export const Paused: Story = {
  args: { isPaused: true },
}
