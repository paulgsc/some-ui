import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import type { SetItem } from "@topik/lib/topik/read-aloud/set-builder"
import { STARTER_DECK } from "@topik/lib/topik/read-aloud/starter"

import { RepCard } from "."

type Story = StoryObj<typeof RepCard>
type Meta = MetaObj<typeof RepCard>

const noop = (): void => undefined

const WONIMNIDA: SetItem = {
  kind: "word",
  key: "w:won:원입니다",
  wordId: "won",
  text: "원입니다",
  lineId: "cafe-price",
  syllables: 4,
}

/** The starter deck's longest line: ten words, four said differently. */
const COLD_WEATHER: SetItem = {
  kind: "sentence",
  key: "s:cold-weather",
  lineId: "cold-weather",
  text: "요즘 날씨가 추워져서 따뜻한 옷을 입고 다니는 사람이 많아졌어요.",
  syllables: 28,
  wordIds: [],
}

const meta: Meta = {
  title: "UI/Chat/Components/Topik/ReadAloud/RepCard",
  component: RepCard,
  args: {
    deck: STARTER_DECK,
    entry: { item: WONIMNIDA, role: "rep" },
    step: "glyphs",
    stepMs: null,
    stepKey: 1,
    reported: false,
    playing: true,
    short: false,
    onStuck: noop,
    onSkip: noop,
    onResume: noop,
  },
  // The drill owns the whole screen on a phone; Storybook's padding would
  // push its dock below the fold and misreport the layout.
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="flex h-svh w-full flex-col">
        <Story />
      </div>
    ),
  ],
}
export default meta

/** The glyphs alone, before the turn begins. */
export const Glyphs: Story = {}

/** The learner's turn: the mark steps through the syllables as the bar empties. */
export const Turn: Story = { args: { step: "turn", stepMs: 6000 } }

/** The audio: syllables said differently from their spelling are shown as said. */
export const Audio: Story = { args: { step: "audio", reported: true } }

/** The echo, still as said. */
export const Echo: Story = { args: { step: "echo", stepMs: 3000 } }

/** The gloss: the spelling restored, the stem set off from its ending. */
export const WordGloss: Story = { args: { step: "gloss" } }

/** A long sentence while the audio plays, as said. */
export const SentenceAudio: Story = {
  args: { entry: { item: COLD_WEATHER, role: "rep" }, step: "audio" },
}

/** A long sentence's gloss: its English and the words it is written with. */
export const SentenceGloss: Story = {
  args: { entry: { item: COLD_WEATHER, role: "rep" }, step: "gloss" },
}

/** A word reported on first sight, introduced before it returns. */
export const Introduction: Story = {
  args: {
    entry: { item: WONIMNIDA, role: "introduction" },
    step: "intro-hold",
  },
}

/** Paused: the rep starts over on resume. */
export const Paused: Story = { args: { step: "paused" } }

/** A phone on its side, with the longest gloss there is. */
export const LandscapeSentenceGloss: Story = {
  args: {
    entry: { item: COLD_WEATHER, role: "rep" },
    step: "gloss",
    short: true,
  },
}
