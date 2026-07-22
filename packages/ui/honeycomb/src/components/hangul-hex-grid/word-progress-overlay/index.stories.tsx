import { mockWordProgress } from "@honeycomb/lib/hangul/story-fixtures"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { WordProgressOverlay } from "."

const meta: Meta<typeof WordProgressOverlay> = {
  title: "UI/Honeycomb/Hangul/Components/WordProgressOverlay",
  component: WordProgressOverlay,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="relative h-64 w-full bg-slate-900">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WordProgressOverlay>

export default meta
type Story = StoryObj<typeof meta>

/** A fresh word challenge, nothing typed yet - every token masked. */
export const JustStarted: Story = {
  args: { progress: mockWordProgress({ cursor: 0 }) },
}

/** Midway through 사과 (apple) - first two jamo revealed, two remaining masked. */
export const MidWord: Story = {
  args: { progress: mockWordProgress({ cursor: 2 }) },
}

/** One token left before the "Celebrate" ceremony (`SuccessFeedback`) takes over. */
export const AlmostComplete: Story = {
  args: { progress: mockWordProgress({ cursor: 3 }) },
}

/** No progress tracked (`null`, e.g. between spawns, or single-jamo play) renders nothing. */
export const Hidden: Story = {
  args: { progress: null },
}

/** A single-token (n=1) "word" also renders nothing - jamo play never shows this overlay. */
export const HiddenForSingleJamo: Story = {
  args: {
    progress: mockWordProgress({
      cellIds: ["hex_0_0_0"],
      answerGlyphs: ["ㄱ"],
      cursor: 0,
    }),
  },
}
