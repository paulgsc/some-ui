import type { Meta, StoryObj } from "@storybook/react-vite"

import { KeyBufferDisplay } from "."

const meta: Meta<typeof KeyBufferDisplay> = {
  title: "UI/Honeycomb/Hangul/Components/KeyBufferDisplay",
  component: KeyBufferDisplay,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="relative h-64 w-full bg-slate-900">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof KeyBufferDisplay>

export default meta
type Story = StoryObj<typeof meta>

/** A single, unambiguous key typed toward the current token. */
export const SingleKey: Story = {
  args: { buffer: "r" },
}

/** A valid prefix of a two-key composite diphthong (e.g. "h" toward "hk" → ㅘ). */
export const PartialComposite: Story = {
  args: { buffer: "h" },
}

/** Same prefix, but it also exactly matches another active cell's full key - ambiguous until the next keystroke. */
export const Ambiguous: Story = {
  args: { buffer: "h", ambiguousCharacters: ["ㅗ", "ㅘ", "ㅙ"] },
}

/** Empty buffer renders nothing - documents the null-render contract. */
export const Hidden: Story = {
  args: { buffer: "" },
}
