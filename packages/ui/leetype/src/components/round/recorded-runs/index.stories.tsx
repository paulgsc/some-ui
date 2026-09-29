import type { ReactNode } from "react"
import { RoundRunsSchema } from "@leetype/lib/leetype/round-runs"
import { BUNDLED_ROUND_RUNS } from "@leetype/lib/leetype/round-runs/bundled"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { RecordedRuns } from "."

const meta: Meta<typeof RecordedRuns> = {
  title: "UI/Input/Components/Round/RecordedRuns",
  component: RecordedRuns,
  parameters: {
    layout: "fullscreen",
    viewport: { defaultViewport: "mobile1" },
  },
}

export default meta
type Story = StoryObj<typeof RecordedRuns>

const Phone = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto w-full max-w-[390px] p-3">{children}</div>
)

// The real, bundled transcripts (machine-produced by paulgsc/server's
// runner), not hand-typed examples: a story that drifts from what the
// runner writes would hide exactly the layout a real message needs.
const HAS_DUPLICATE = RoundRunsSchema.parse(
  BUNDLED_ROUND_RUNS["has-duplicate-sort-adjacent"]
)
const RANGE_SUMS = RoundRunsSchema.parse(
  BUNDLED_ROUND_RUNS["range-sums-prefix"]
)

/** The admissible rewrite chosen: A stops at the new bounds, the rewrite finishes. */
export const AdmissibleRewriteChosen: Story = {
  render: () => (
    <Phone>
      <RecordedRuns transcript={HAS_DUPLICATE} chosen="d0" dimensions={["n"]} />
    </Phone>
  ),
}

/** A distractor chosen: neither finishes at the new bounds. */
export const DistractorChosen: Story = {
  render: () => (
    <Phone>
      <RecordedRuns transcript={HAS_DUPLICATE} chosen="d1" dimensions={["n"]} />
    </Phone>
  ),
}

/** Two dimensions, and an output with a space in it. */
export const TwoDimensions: Story = {
  render: () => (
    <Phone>
      <RecordedRuns
        transcript={RANGE_SUMS}
        chosen="d0"
        dimensions={["n", "q"]}
      />
    </Phone>
  ),
}
