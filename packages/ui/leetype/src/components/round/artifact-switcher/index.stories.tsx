import type { ReactNode } from "react"
import { BudgetDisplay } from "@leetype/components/round/budget-display"
import { ConstraintDiff } from "@leetype/components/round/constraint-diff"
import { RoundChoices } from "@leetype/components/round/round-choices"
import { SourcePanel } from "@leetype/components/round/source-panel"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionOption } from "@leetype/lib/leetype/round-probe"
import { ROUND_PROBE_PROMPT } from "@leetype/lib/leetype/round-probe"
import type { Algorithm } from "@leetype/types/algorithm"
import type {
  Budget,
  ConstraintDiff as ConstraintDiffValue,
} from "@leetype/types/constraint"
import type { Meta, StoryObj } from "@storybook/react-vite"

import type { SwitchableArtifact } from "."
import { ArtifactSwitcher } from "."

const meta: Meta<typeof ArtifactSwitcher> = {
  title: "UI/Input/Components/Round/ArtifactSwitcher",
  component: ArtifactSwitcher,
  parameters: {
    // `fullscreen`, not `centered`: `centered` adds its own padding that
    // would push a 360px `Phone` past a narrower preview and report a
    // horizontal page scroll that isn't real (`DiffCard`'s own story
    // documents the identical trap).
    layout: "fullscreen",
    viewport: { defaultViewport: "mobile1" },
  },
}

export default meta
type Story = StoryObj<typeof ArtifactSwitcher>

/** 360px — this story's own literal acceptance number, not the 390px other `round/*` stories use. */
const Phone = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto w-full max-w-[360px] p-3">{children}</div>
)

const PLACEHOLDER_ARTIFACTS: ReadonlyArray<SwitchableArtifact> = [
  {
    id: "algorithm",
    label: "Algorithm",
    content: (
      <div className="rounded-md border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
        Stand-in for A — a real round hands this SourcePanel.
      </div>
    ),
  },
  {
    id: "constraintDiff",
    label: "Constraints",
    content: (
      <div className="rounded-md border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
        Stand-in for C — a real round hands this ConstraintDiff.
      </div>
    ),
  },
  {
    id: "budget",
    label: "Budget",
    content: (
      <div className="rounded-md border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
        Stand-in for B — a real round hands this BudgetDisplay.
      </div>
    ),
  },
  {
    id: "diffSet",
    label: "Candidate patches",
    content: (
      <div className="rounded-md border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
        Stand-in for D — its own renderer is a separate, not-yet-built story,
        per the out-of-scope list on this issue.
      </div>
    ),
  },
]

/**
 * Press either chevron, or swipe left/right anywhere on the panel below the
 * dots — both reach every position, and dragging left goes forward the same
 * way tapping "Next" does. Four artifacts, all available from the start, so
 * this story is the plain press-and-swipe demonstration with nothing about
 * phase in the way.
 */
export const Interactive: Story = {
  render: () => (
    <Phone>
      <ArtifactSwitcher
        artifacts={PLACEHOLDER_ARTIFACTS}
        roundId="story-round"
      />
    </Phone>
  ),
}

/**
 * Before an execution has run, `runResult` is absent — not a fifth,
 * grey-out chevron stop hinting a result is coming, just three reachable
 * positions. Compare with `AfterARun`, below: the only difference is
 * whether the caller included the fourth artifact in the array, exactly
 * the acceptance criterion ("unavailability is absence, never a disabled
 * control").
 */
export const BeforeARun: Story = {
  render: () => (
    <Phone>
      <ArtifactSwitcher
        artifacts={PLACEHOLDER_ARTIFACTS.slice(0, 3)}
        roundId="story-round-before"
      />
    </Phone>
  ),
}

/** The same round, past its execution — `runResult` is now a fourth reachable position, not a control that was there all along waiting to unlock. */
export const AfterARun: Story = {
  render: () => (
    <Phone>
      <ArtifactSwitcher
        artifacts={[
          ...PLACEHOLDER_ARTIFACTS.slice(0, 3),
          {
            id: "runResult",
            label: "Result",
            content: (
              <div className="rounded-md border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                Stand-in for r — X2 (#1223) is the story that builds its real
                renderer.
              </div>
            ),
          },
        ]}
        roundId="story-round-after"
      />
    </Phone>
  ),
}

/** A single artifact: both chevrons disabled, no dots (nothing to indicate a position among one). */
export const SinglePosition: Story = {
  render: () => (
    <Phone>
      <ArtifactSwitcher
        artifacts={PLACEHOLDER_ARTIFACTS.slice(0, 1)}
        roundId="story-round-single"
      />
    </Phone>
  ),
}

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

/**
 * The same four positions, but each `content` is the real sibling
 * component R1-R4/B2-B3 already built — `SourcePanel`, `ConstraintDiff`,
 * `BudgetDisplay`, `RoundChoices` — composed through this switcher rather
 * than a placeholder. This is the story that actually exercises "what each
 * artifact looks like inside is reused, not reinvented," proving the
 * switcher's generic `content: ReactNode` slot really does host unmodified
 * existing renderers, including `SourcePanel`'s own internal toggle state
 * and `RoundChoices`'s own internal commit state — both keep working
 * exactly as they do standalone, since this component never reaches into
 * them.
 */
export const ComposedFromRealArtifacts: Story = {
  render: () => (
    <Phone>
      <ArtifactSwitcher
        artifacts={[
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
        ]}
        roundId="story-round-real"
      />
    </Phone>
  ),
}
