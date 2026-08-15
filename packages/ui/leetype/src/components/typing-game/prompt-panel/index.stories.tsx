import type { JSX } from "react"
import {
  FIXTURE_ADVERSARIAL_EXERCISE_ID,
  FIXTURE_HOSTILE_PROMPT_STEP,
  nextExercise,
} from "@leetype/lib/leetype/exercises"
import type { Exercise, Step } from "@leetype/types/exercise"
import { promptBlocksOf } from "@leetype/types/exercise"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { PromptPanel } from "."

const meta: Meta<typeof PromptPanel> = {
  title: "UI/Input/Components/Typing/PromptPanel",
  component: PromptPanel,
}

export default meta
type Story = StoryObj<typeof PromptPanel>

const seed = nextExercise()
const adversarial = nextExercise({ preferId: FIXTURE_ADVERSARIAL_EXERCISE_ID })

/** Wraps a single step as its own exercise, for stories with no corpus entry to pull from. */
function wrap(id: string, title: string, step: Step): Exercise {
  return { id, title, steps: [step] }
}

/**
 * The hostile long prompt, wrapped as a one-step exercise: it is well past
 * `PromptBlockSchema`'s budget and cannot live in the validated corpus (see
 * `lib/leetype/exercises/seed.ts`), but the pagination path it exercises is
 * still real code that has to keep working as a defensive floor.
 */
const hostile: Exercise = wrap(
  "fixture-hostile",
  "Hostile fixture",
  FIXTURE_HOSTILE_PROMPT_STEP
)

// ── One fixture step per evidence kind ────────────────────────────────────
//
// None of these live in the seed corpus: the shim's hand-authored exercises
// predate the evidence kinds, and rewriting them to use one is an authoring
// decision for its own story, not a side effect of proving the panel can
// render what it is handed.

const transitionExercise = wrap("fixture-transition", "Transition fixture", {
  id: "story-transition",
  goal: "See the lookup count drop from two hashes to one.",
  concepts: ["fixture"],
  blocks: [
    {
      kind: "transition",
      label: "lookups",
      before: "2 (contains_key, then insert)",
      after: "1 (entry)",
    },
    {
      kind: "typing",
      source: 'map.entry("b").or_insert(Vec::new());',
      language: "rust",
    },
  ],
})

const traceExercise = wrap("fixture-trace", "Trace fixture", {
  id: "story-trace",
  goal: "Read what the failing run actually produced.",
  concepts: ["fixture"],
  blocks: [
    {
      kind: "trace",
      headline: "TIMEOUT",
      observations: [
        { label: "iterations", value: "10,000" },
        { label: "cursor", value: "0 → 0" },
      ],
    },
    { kind: "typing", source: "loop {}", language: "rust" },
  ],
})

const regionExercise = wrap("fixture-region", "Region fixture", {
  id: "story-region",
  goal: "Notice which part of the line is already finalized.",
  concepts: ["fixture"],
  blocks: [
    {
      kind: "region",
      label: 'the finalized prefix, up through .entry("b")',
      startDisplay: 0,
      endDisplay: 15,
    },
    {
      kind: "typing",
      source: 'map.entry("b").or_insert(Vec::new());',
      language: "rust",
    },
  ],
})

const mixedEvidenceExercise = wrap(
  "fixture-mixed-evidence",
  "Mixed evidence fixture",
  {
    id: "story-mixed",
    goal: "See ordinary prose sit beside two kinds of evidence.",
    concepts: ["fixture"],
    blocks: [
      { kind: "prompt", lines: ["One line of ordinary prose, for contrast."] },
      { kind: "transition", before: "2 lookups", after: "1 lookup" },
      {
        kind: "trace",
        observations: [{ label: "iterations", value: "10,000" }],
      },
      {
        kind: "typing",
        source: 'map.entry("b").or_insert(Vec::new());',
        language: "rust",
      },
    ],
  }
)

/**
 * The panel is bounded by its *box*, not by its contents — so every story
 * puts it in one. A narrow box and a short one are where a panel that
 * reached for a scrollbar would give itself away.
 */
const PanelInBox = ({
  exercise,
  stepIndex,
  width,
  height,
}: {
  exercise: Exercise
  stepIndex: number
  width: string
  height: string
}): JSX.Element => {
  const step = exercise.steps[stepIndex]

  return (
    <div
      className="code flex flex-col overflow-hidden rounded-lg border border-dashed border-border p-2"
      style={{ width: `min(${width}, 100%)`, height }}
    >
      <PromptPanel
        goal={step?.goal ?? ""}
        blocks={step ? promptBlocksOf(step) : []}
        position={stepIndex + 1}
        total={exercise.steps.length}
      />
    </div>
  )
}

/** The ordinary case: a one-line prompt. */
export const OneLine: Story = {
  render: () => (
    <PanelInBox exercise={seed} stepIndex={5} width="42rem" height="24rem" />
  ),
}

/** Two lines, the longest a well-authored prompt block should carry. */
export const SeveralLines: Story = {
  render: () => (
    <PanelInBox exercise={seed} stepIndex={6} width="42rem" height="24rem" />
  ),
}

/**
 * The hostile one, well past the prose budget. This is the case the
 * doctrine exists for: it must page rather than scroll, and nothing may be
 * silently cut off. Never part of the validated corpus — see `hostile`
 * above.
 */
export const DeliberatelyAbusive: Story = {
  render: () => (
    <PanelInBox exercise={hostile} stepIndex={0} width="42rem" height="24rem" />
  ),
}

/** The same abusive prompt in a narrow column, where every line wraps. */
export const AbusiveAndNarrow: Story = {
  render: () => (
    <PanelInBox exercise={hostile} stepIndex={0} width="20rem" height="22rem" />
  ),
}

/** A step with no prompt blocks at all — the goal, and nothing else. */
export const GoalOnly: Story = {
  render: () => (
    <PanelInBox
      exercise={adversarial}
      stepIndex={1}
      width="42rem"
      height="20rem"
    />
  ),
}

// ── One story per evidence kind (LTY-EVIDENCE E2/E3) ──────────────────────

/** The `transition` kind: a before/after pair. */
export const Transition: Story = {
  render: () => (
    <PanelInBox
      exercise={transitionExercise}
      stepIndex={0}
      width="42rem"
      height="24rem"
    />
  ),
}

/** The `trace` kind: a failure headline plus labelled observations. */
export const Trace: Story = {
  render: () => (
    <PanelInBox
      exercise={traceExercise}
      stepIndex={0}
      width="42rem"
      height="24rem"
    />
  ),
}

/** The `region` kind: a labelled span over the frame — just the label, today. */
export const Region: Story = {
  render: () => (
    <PanelInBox
      exercise={regionExercise}
      stepIndex={0}
      width="42rem"
      height="24rem"
    />
  ),
}

/** All three evidence kinds beside plain prose, on one step. */
export const MixedEvidence: Story = {
  render: () => (
    <PanelInBox
      exercise={mixedEvidenceExercise}
      stepIndex={0}
      width="42rem"
      height="24rem"
    />
  ),
}
