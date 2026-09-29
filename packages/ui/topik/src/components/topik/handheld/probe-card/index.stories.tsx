import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import { FIXTURE_BATCHES } from "@topik/components/topik/handheld/handheld-lesson/fixture"
import type { Probe } from "@topik/lib/topik"

import { ProbeCard } from "."

type Story = StoryObj<typeof ProbeCard>
type Meta = MetaObj<typeof ProbeCard>

const first = FIXTURE_BATCHES[0]!
const second = FIXTURE_BATCHES[1]!
const probe = (batch: typeof first, id: string): Probe =>
  batch.probes!.find((candidate) => candidate.id === id)!
const noop = (): void => undefined

const meta: Meta = {
  title: "UI/Chat/Components/Topik/Handheld/ProbeCard",
  component: ProbeCard,
  // The applet owns the whole screen on a phone; Storybook's padding would
  // push its dock below the fold and misreport the layout.
  parameters: { layout: "fullscreen" },
  args: {
    probe: probe(second, "c2-promise-forms"),
    source: "카드로 할게요.",
    seedKey: "story:c2-promise-forms",
    anchor: second.messages[1],
    lines: second.messages,
    answered: null,
    showGloss: true,
    repeat: false,
    audio: true,
    speaking: false,
    short: false,
    onReplayAnchor: noop,
    onAnswer: noop,
    onNext: noop,
  },
  decorators: [
    (Story) => (
      <div className="flex h-svh w-full flex-col">
        <Story />
      </div>
    ),
  ],
}
export default meta

/**
 * Second order: four claimed transformations of 카드로 할게요, each shown as a
 * diff against it; one does not hold.
 */
export const OddOneOut: Story = {}

/** Third order: which reply fits, in Korean. */
export const PickAReply: Story = {
  args: {
    probe: probe(first, "c1-reply"),
    source: "어서 오세요. 뭐 드릴까요?",
    seedKey: "story:c1-reply",
    anchor: first.messages[0],
    lines: first.messages,
  },
}

/** Third order, answered in prose: why this verb and not that one. */
export const PickAnExplanation: Story = {
  args: {
    probe: probe(first, "c1-honorific"),
    source: "여기서 드시고 가세요?",
    seedKey: "story:c1-honorific",
    anchor: first.messages[2],
    lines: first.messages,
  },
}

/** Build the negation of a request from tiles (canon Def. 4.5). */
export const BuildIt: Story = {
  args: {
    probe: probe(first, "c1-build-negation"),
    source: "포장해 주세요.",
    seedKey: "story:c1-build-negation",
    anchor: first.messages[3],
    lines: first.messages,
  },
}

/** Answered: every candidate with its verdict and reason, the pick marked. */
export const AnsweredMissed: Story = {
  args: {
    answered: {
      correct: false,
      response: "카드로 했어요.",
      channel: "selection",
      anchorReveal: 1,
    },
    showGloss: false,
  },
}

/** A build, answered right, with the line's English now unlocked. */
export const BuildAnswered: Story = {
  args: {
    ...BuildIt.args,
    answered: {
      correct: true,
      response: "포장하지 마세요",
      channel: "assembly",
      anchorReveal: 1,
    },
  },
}

/** A phone on its side, mid-question. */
export const Landscape: Story = { args: { short: true } }
