import type { ConstraintDiff as ConstraintDiffValue } from "@leetype/types/constraint"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { ConstraintDiff } from "."

const meta: Meta<typeof ConstraintDiff> = {
  title: "UI/Input/Components/Round/ConstraintDiff",
  component: ConstraintDiff,
  parameters: {
    layout: "fullscreen",
    viewport: { defaultViewport: "mobile1" },
  },
}

export default meta
type Story = StoryObj<typeof ConstraintDiff>

const Phone = ({ diff }: { diff: ConstraintDiffValue }) => (
  <div className="mx-auto w-full max-w-[390px] p-3">
    <ConstraintDiff diff={diff} />
  </div>
)

/**
 * Cor. 3.1's own reading exercise: the bound on `n` went up, and nothing
 * about the algorithm changed. This card, on its own, with no code diff
 * beside it, is Def. 8.1.1's `ok` branch — a round is still a round without
 * an accompanying code change.
 */
export const BoundIncreased: Story = {
  render: () => (
    <Phone
      diff={{
        before: [{ dimension: "n", operator: "<=", bound: 100000 }],
        after: [{ dimension: "n", operator: "<=", bound: 1000000 }],
      }}
    />
  ),
}

/** A bound that tightens rather than loosens — `>=`'s own mathematical symbol. */
export const BoundTightened: Story = {
  render: () => (
    <Phone
      diff={{
        before: [{ dimension: "k", operator: ">=", bound: 1 }],
        after: [{ dimension: "k", operator: ">=", bound: 4 }],
      }}
    />
  ),
}

/**
 * One dimension moves, a second stays fixed — the unchanged row renders once,
 * as context, never duplicated as a del/add pair.
 */
export const MixedWithUnchangedDimension: Story = {
  render: () => (
    <Phone
      diff={{
        before: [
          { dimension: "n", operator: "<=", bound: 100000 },
          { dimension: "m", operator: "<=", bound: 100 },
        ],
        after: [
          { dimension: "n", operator: "<=", bound: 200000 },
          { dimension: "m", operator: "<=", bound: 100 },
        ],
      }}
    />
  ),
}
