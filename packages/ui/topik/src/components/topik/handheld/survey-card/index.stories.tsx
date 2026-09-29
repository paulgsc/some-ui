import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import { FIXTURE_BATCHES } from "@topik/components/topik/handheld/handheld-lesson/fixture"
import { stuckCandidates } from "@topik/lib/topik/core/lesson-survey"

import { SurveyCard } from "."

type Story = StoryObj<typeof SurveyCard>
type Meta = MetaObj<typeof SurveyCard>

const noop = (): void => undefined

const missedEverything = stuckCandidates(
  FIXTURE_BATCHES,
  Object.fromEntries(
    FIXTURE_BATCHES.map((batch) => [
      batch.id,
      (batch.probes ?? []).map((probe) => probe.id),
    ])
  )
)

const meta: Meta = {
  title: "UI/Chat/Components/Topik/Handheld/SurveyCard",
  component: SurveyCard,
  args: {
    candidates: missedEverything,
    short: false,
    onSubmit: noop,
    onSkip: noop,
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

export const Worthwhile: Story = {}

/** The tallest dock: as many blocking candidates as it holds. */
export const Blocking: Story = { args: { initialStep: "blocking" } }

export const Becoming: Story = { args: { initialStep: "becoming" } }

export const NothingMissed: Story = {
  args: { candidates: [], initialStep: "difficulty" },
}

export const BlockingLandscape: Story = {
  args: { initialStep: "blocking", short: true },
}
