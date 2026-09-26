import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import { FIXTURE_BATCHES } from "@topik/components/topik/handheld/handheld-lesson/fixture"

import { CheckCard } from "."

type Story = StoryObj<typeof CheckCard>
type Meta = MetaObj<typeof CheckCard>

const first = FIXTURE_BATCHES[0]!
const second = FIXTURE_BATCHES[1]!
const noop = (): void => undefined

const meta: Meta = {
  title: "UI/Chat/Components/Topik/Handheld/CheckCard",
  component: CheckCard,
  args: {
    question: first.questions[0]!,
    seedKey: "story:1:0",
    anchor: first.messages[1],
    siblings: first.questions,
    lines: first.messages,
    answered: null,
    repeat: false,
    audio: true,
    speaking: false,
    short: false,
    onReplayAnchor: noop,
    onAnswer: noop,
    onNext: noop,
  },
  // The applet owns the whole screen on a phone; Storybook's padding would
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

/** A multiple-choice item: a selection. */
export const Selection: Story = {}

/** A typed-answer item realised as word tiles (canon Def. 4.5). */
export const WordTiles: Story = {
  args: {
    question: first.questions[1]!,
    anchor: first.messages[3],
    seedKey: "story:1:1",
  },
}

/** A one-word Hangul answer: syllable tiles. */
export const SyllableTiles: Story = {
  args: {
    question: second.questions[0]!,
    anchor: second.messages[1],
    siblings: second.questions,
    lines: second.messages,
    seedKey: "story:2:0",
  },
}

/** A typed answer that cannot be tiled falls back to a selection, and says so in its outcome. */
export const UntileableFallsBack: Story = {
  args: {
    question: second.questions[1]!,
    anchor: second.messages[1],
    siblings: second.questions,
    lines: second.messages,
    seedKey: "story:2:1",
  },
}

/** Answered, missed: the explanation, and the anchor line's gloss now unlocked. */
export const Missed: Story = {
  args: {
    question: first.questions[1]!,
    anchor: first.messages[3],
    answered: {
      correct: false,
      response: "주세요 포장해",
      channel: "assembly",
      anchorReveal: 1,
    },
  },
}

/** A phone on its side, mid-question. */
export const Landscape: Story = { args: { short: true } }
