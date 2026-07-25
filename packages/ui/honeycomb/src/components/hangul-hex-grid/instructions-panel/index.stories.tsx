import type { Meta, StoryObj } from "@storybook/react-vite"

import { InstructionsPanel } from "."

const meta: Meta<typeof InstructionsPanel> = {
  title: "UI/Honeycomb/Hangul/Components/InstructionsPanel",
  component: InstructionsPanel,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="relative h-56 w-full bg-slate-900">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InstructionsPanel>

export default meta
type Story = StoryObj<typeof meta>

/** Completion-mode copy: "Complete all characters before time expires!" */
export const CompletionMode: Story = {
  args: { mode: "completion" },
}

/**
 * Every non-completion mode (endless, vocabulary, vocabulary-endless) shares
 * the same streak/difficulty copy - one story is sufficient to cover that
 * shared branch.
 */
export const EndlessMode: Story = {
  args: { mode: "endless" },
}
