import type { FC } from "react"
import { useState } from "react"
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
import type { Commitment } from "@leetype/types/commitment"
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
const ANSWER_TEXT = OPTIONS.find((option) => option.id === ANSWER_ID)!.text

// Static — used only by `Narrow`, the same positional demonstration
// `ArtifactSwitcher`'s own `ComposedFromRealArtifacts` story already makes,
// with no commitment to observe. `InteractiveRound` below builds its own
// array instead, because it has to wire a real `onCommit`.
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
 * `PreCommitment`/`PostCommitment` share this rather than each building a
 * fixed snapshot: `commitment` has to be real React state, wired to the
 * *same* `RoundChoices` instance's `onCommit` that feeds it, or the two
 * stories only ever show two disconnected renders instead of one
 * transition a reader can actually watch happen (review finding, #1439,
 * chatgpt-codex-connector — the original version hard-coded `commitment`
 * per story while `RoundChoices` kept its own independent, always-fresh
 * `committed` state, so `PreCommitment` could never open the reveal pane no
 * matter what a reader clicked, and `PostCommitment` showed the reveal pane
 * next to option rows that still looked unanswered — the exact
 * pre-commitment leak this component exists to prevent, on the story meant
 * to demonstrate the opposite).
 */
const InteractiveRound: FC = () => {
  const [commitment, setCommitment] = useState<Commitment | null>(null)

  const artifacts: ReadonlyArray<SwitchableArtifact> = [
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
          onCommit={setCommitment}
        />
      ),
    },
  ]

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <WideRoundSurface
        roundId="story-round"
        artifacts={artifacts}
        revealArtifacts={REVEAL_ARTIFACTS}
        commitment={commitment}
        probeExercise={PROBE_EXERCISE}
      />
    </div>
  )
}

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
 * extra room buys size, not simultaneity (Rem. 9.2). Genuinely interactive:
 * pick an option below to watch the reveal pane actually appear, rather
 * than trusting a caption that it would. Neither this story nor
 * `PostCommitment` below is "the" primary wide story; they're peers showing
 * the same round before and after the one thing that changes what's on
 * screen.
 */
export const PreCommitment: Story = {
  render: () => <InteractiveRound />,
}

/**
 * Once a commitment lands, simultaneous display is where it belongs: the
 * diff and the now-revealed proposition, side by side. The `play` function
 * makes the *same* commit gesture a learner would — clicking the answer row
 * inside `RoundChoices` — rather than hard-coding `commitment` while
 * `RoundChoices` itself stays fresh and unanswered underneath: that gap is
 * exactly the commitment leak this component exists to rule out, so this
 * story's default state has to be reached the same way a real one would be,
 * not merely made to look reached.
 */
export const PostCommitment: Story = {
  render: () => <InteractiveRound />,
  play: async ({ canvasElement }) => {
    const findAnswerButton = (): HTMLButtonElement | undefined =>
      Array.from(canvasElement.querySelectorAll("button")).find((button) =>
        button.textContent.includes(ANSWER_TEXT)
      )

    // The answer lives on the option-set artifact, reached only after the
    // switcher visits it — `ArtifactSwitcher` never mounts an artifact
    // nobody has navigated to, so the button this story wants to click
    // doesn't exist until "Next" has been pressed enough times to reach it.
    for (let i = 0; i < 5 && !findAnswerButton(); i++) {
      canvasElement
        .querySelector<HTMLButtonElement>('button[aria-label="Next artifact"]')
        ?.click()
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    findAnswerButton()?.click()
  },
}
