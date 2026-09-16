import { ArtifactSwitcher } from "@leetype/components/round/artifact-switcher"
import type { SwitchableArtifact } from "@leetype/components/round/artifact-switcher"
import { BudgetDisplay } from "@leetype/components/round/budget-display"
import { ConstraintDiff } from "@leetype/components/round/constraint-diff"
import { RoundChoices } from "@leetype/components/round/round-choices"
import { SourcePanel } from "@leetype/components/round/source-panel"
import {
  FIXTURE_EXERCISE_ID,
  nextExercise,
} from "@leetype/lib/leetype/exercises"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionOption } from "@leetype/lib/leetype/round-probe"
import { ROUND_PROBE_PROMPT } from "@leetype/lib/leetype/round-probe"
import type { Algorithm } from "@leetype/types/algorithm"
import type {
  Budget,
  ConstraintDiff as ConstraintDiffValue,
} from "@leetype/types/constraint"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { WideRoundSurface } from "."

const meta: Meta<typeof WideRoundSurface> = {
  title: "UI/Input/Components/Round/WideRoundSurface",
  component: WideRoundSurface,
  parameters: { layout: "fullscreen" },
}

export default meta
type Story = StoryObj<typeof WideRoundSurface>

// The exact same round `ArtifactSwitcher`'s own `ComposedFromRealArtifacts`
// story uses — this file's whole point is proving the wide surface
// reproduces C1's sequencing for one round, not a different one.
const BINARY_SEARCH: Algorithm = {
  source: `export function binarySearch(target: number, values: number[]): number {
  let lo = 0
  let hi = values.length - 1

  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / 2)
    const at = values[mid]

    if (at === target) return mid
    if (at < target) lo = mid + 1
    else hi = mid - 1
  }

  return -1
}`,
  language: "typescript",
  entryPoint: "binarySearch",
  inputAlphabet: "a sorted i32 array plus a target, both fit in memory",
}

const CONSTRAINT_DIFF: ConstraintDiffValue = {
  before: [{ dimension: "n", operator: "<=", bound: 100000 }],
  after: [{ dimension: "n", operator: "<=", bound: 1000000 }],
}

const BUDGET: Budget = { operations: 10_000_000, wallClock: "~1 second" }

const OPTIONS: ReadonlyArray<PropositionOption> = [
  { id: "CW-P1", text: "Sequential composition adds" },
  { id: "CW-P5", text: "Preprocessing substitutes space for repeated search" },
  { id: "CW-P6", text: "Ordering substitutes a logarithm for a scan" },
]
const ANSWER_ID: PropositionId = "CW-P6"

const ARTIFACTS: ReadonlyArray<SwitchableArtifact> = [
  {
    id: "algorithm",
    label: "Algorithm",
    content: <SourcePanel algorithm={BINARY_SEARCH} />,
  },
  {
    id: "constraintDiff",
    label: "Constraints",
    content: <ConstraintDiff diff={CONSTRAINT_DIFF} />,
  },
  {
    id: "budget",
    label: "Budget",
    content: <BudgetDisplay budget={BUDGET} />,
  },
  {
    id: "optionSet",
    label: "Which proposition?",
    content: (
      <RoundChoices
        prompt={ROUND_PROBE_PROMPT}
        options={OPTIONS}
        answerId={ANSWER_ID}
        onCommit={() => {}}
      />
    ),
  },
]

const REVEAL_ARTIFACTS: ReadonlyArray<SwitchableArtifact> = [
  {
    id: "diffSet",
    label: "Candidate patches",
    content: (
      <div className="rounded-md border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
        Stand-in for D — its own renderer is a separate, not-yet-built story,
        the same placeholder `ArtifactSwitcher`&apos;s own stories use.
      </div>
    ),
  },
]

const PROBE_EXERCISE = nextExercise({ preferId: FIXTURE_EXERCISE_ID })

/**
 * The same round, at C1's own reference width — this component adds nothing
 * here; a phone gets the plain switcher `#1213` already built, one artifact
 * at a time, no reveal pane and no production probe in sight. Included so
 * this file can point at "the same round, both widths" without asking a
 * reader to flip back to `ArtifactSwitcher`'s own story file.
 */
export const Narrow: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => (
    <div className="mx-auto w-full max-w-[360px] p-3">
      <ArtifactSwitcher artifacts={ARTIFACTS} roundId="story-round" />
    </div>
  ),
}

/**
 * The wide surface's default: one artifact at a time, same as the phone —
 * extra room buys size, not simultaneity (Rem. 9.2). Neither this story nor
 * `PostCommitment` below is "the" primary wide story; they're peers showing
 * the same round before and after the one thing that changes what's on
 * screen.
 */
export const PreCommitment: Story = {
  render: () => (
    <div className="mx-auto w-full max-w-3xl p-6">
      <WideRoundSurface
        roundId="story-round"
        artifacts={ARTIFACTS}
        revealArtifacts={REVEAL_ARTIFACTS}
        commitment={null}
        probeExercise={PROBE_EXERCISE}
      />
    </div>
  ),
}

/**
 * Once a commitment lands, simultaneous display is where it belongs: the
 * diff and the now-revealed proposition, side by side — the primary
 * switcher's own instance (and whatever position it was at) survives the
 * transition unchanged.
 */
export const PostCommitment: Story = {
  render: () => (
    <div className="mx-auto w-full max-w-3xl p-6">
      <WideRoundSurface
        roundId="story-round"
        artifacts={ARTIFACTS}
        revealArtifacts={REVEAL_ARTIFACTS}
        commitment={{ kind: "choice", id: ANSWER_ID }}
        probeExercise={PROBE_EXERCISE}
      />
    </div>
  ),
}
