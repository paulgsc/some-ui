import type { Meta, StoryObj } from "@storybook/react-vite"

import { GridErrorOverlay } from "."

const meta: Meta<typeof GridErrorOverlay> = {
  title: "UI/Honeycomb/Hangul/Components/GridErrorOverlay",
  component: GridErrorOverlay,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="relative h-[500px] w-full bg-slate-900">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GridErrorOverlay>

export default meta
type Story = StoryObj<typeof meta>

export const Fatal: Story = {
  args: { error: "Failed to initialize WASM" },
}

/** `error: null` renders nothing - the grid loaded fine. */
export const Hidden: Story = {
  args: { error: null },
}
