import { mockIconStimulus } from "@honeycomb/lib/hangul/story-fixtures"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { PromptStation } from "."

const meta: Meta<typeof PromptStation> = {
  title: "UI/Honeycomb/Hangul/Components/PromptStation",
  component: PromptStation,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="relative h-80 w-full bg-slate-900">
        <Story />
      </div>
    ),
  ],
  args: {
    stimulus: mockIconStimulus("apple"),
  },
} satisfies Meta<typeof PromptStation>

export default meta
type Story = StoryObj<typeof meta>

/** No word challenge active - the minimal "radio" dot, audio-first footprint. */
export const Idle: Story = {
  args: { tier: "idle" },
}

/** A word just spawned - icon shown, no escalation yet. */
export const IconOnly: Story = {
  args: { tier: "icon" },
}

/** After one miss or 3s elapsed - icon plus a TTS replay button (auto-plays once on entry). */
export const IconWithTts: Story = {
  args: { tier: "icon-tts" },
}

/** After two misses or 6s elapsed - icon, TTS, and a romanization caption. */
export const FullEscalation: Story = {
  args: { tier: "icon-tts-romanization" },
}

/** A `Glyph` stimulus (ordinary jamo play) - the station renders nothing, unaffected by hangul word mode. */
export const HiddenForGlyphStimulus: Story = {
  args: {
    stimulus: { kind: "glyph", text: "ㄱ" },
    tier: "icon-tts-romanization",
  },
}
