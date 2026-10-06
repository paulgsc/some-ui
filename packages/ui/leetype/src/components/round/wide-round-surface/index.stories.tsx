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

// The same round as `ArtifactSwitcher`'s `ComposedFromRealArtifacts` story.
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

// Static, for `Narrow` only; `InteractiveRound` builds its own to wire `onCommit`.
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
 * Shared by `PreCommitment`/`PostCommitment`: `commitment` is real state fed
 * by the same `RoundChoices`' `onCommit`, so the stories show one real
 * transition. A hard-coded `commitment` would show a reveal pane beside
 * unanswered rows, the very leak this component prevents.
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
 * The same round at phone width: the plain switcher, one artifact at a time,
 * no reveal pane or probe.
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
 * The wide default: one artifact at a time, as on the phone (Rem. 9.2: extra
 * room buys size, not simultaneity). Pick an option to watch the reveal pane
 * appear.
 */
export const PreCommitment: Story = {
  render: () => <InteractiveRound />,
}

/**
 * After a commitment: the diff and the revealed proposition side by side.
 * `play` makes the real commit gesture (clicking the answer row) rather than
 * faking `commitment`.
 */
export const PostCommitment: Story = {
  render: () => <InteractiveRound />,
  play: async ({ canvasElement }) => {
    const findAnswerButton = (): HTMLButtonElement | undefined =>
      Array.from(canvasElement.querySelectorAll("button")).find((button) =>
        button.textContent.includes(ANSWER_TEXT)
      )

    // The option-set artifact mounts only once visited, so press Next to it.
    for (let i = 0; i < 5 && !findAnswerButton(); i++) {
      canvasElement
        .querySelector<HTMLButtonElement>('button[aria-label="Next artifact"]')
        ?.click()
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    findAnswerButton()?.click()
  },
}
