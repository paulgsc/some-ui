import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "storybook/test"

import { PauseOverlay } from "."

const meta: Meta<typeof PauseOverlay> = {
  title: "UI/Honeycomb/Hangul/Components/PauseOverlay",
  component: PauseOverlay,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="relative h-[500px] w-full bg-slate-900">
        <Story />
      </div>
    ),
  ],
  args: {
    onResume: fn(),
  },
} satisfies Meta<typeof PauseOverlay>

export default meta
type Story = StoryObj<typeof meta>

export const Paused: Story = {
  args: { isPaused: true },
}

/** `isPaused: false` renders nothing. */
export const Hidden: Story = {
  args: { isPaused: false },
}
