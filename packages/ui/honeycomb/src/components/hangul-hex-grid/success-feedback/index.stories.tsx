import type { Meta, StoryObj } from "@storybook/react-vite"

import { SuccessFeedback } from "."

const meta: Meta<typeof SuccessFeedback> = {
  title: "UI/Honeycomb/Hangul/Components/SuccessFeedback",
  component: SuccessFeedback,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="relative h-64 w-full bg-slate-900">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SuccessFeedback>

export default meta
type Story = StoryObj<typeof meta>

/** An ordinary single-jamo match - points-only popup, today's behavior unchanged. */
export const SingleJamoMatch: Story = {
  args: { show: true, points: 10 },
}

/** A completed word - the "Celebrate" ceremony (ADR 0003 §2(c)) reveals the full word above the points. */
export const WordCelebration: Story = {
  args: { show: true, points: 50, word: "사과" },
}

/** `show: false` renders nothing. */
export const Hidden: Story = {
  args: { show: false, points: 10 },
}
