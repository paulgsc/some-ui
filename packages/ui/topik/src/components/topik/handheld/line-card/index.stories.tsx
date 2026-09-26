import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import { FIXTURE_BATCHES } from "@topik/components/topik/handheld/handheld-lesson/fixture"

import { LineCard } from "."

type Story = StoryObj<typeof LineCard>
type Meta = MetaObj<typeof LineCard>

const noop = (): void => undefined

const meta: Meta = {
  title: "UI/Chat/Components/Topik/Handheld/LineCard",
  component: LineCard,
  args: {
    message: FIXTURE_BATCHES[0]!.messages[1]!,
    reveal: 0,
    cap: 2,
    audio: true,
    speaking: false,
    canGoBack: true,
    short: false,
    onReveal: noop,
    onReplay: noop,
    onNext: noop,
    onPrev: noop,
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

/** Rung 0: heard, not yet read. */
export const ListenFirst: Story = {}

/** Rung 1 on a line whose check is still to come: the gloss waits. */
export const HangulGlossWithheld: Story = { args: { reveal: 1, cap: 1 } }

/** Rung 2: everything showing. */
export const WithGloss: Story = { args: { reveal: 2 } }

/** A phone on its side: stage and dock in two columns. */
export const Landscape: Story = { args: { reveal: 2, short: true } }
