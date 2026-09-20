import type { ReactNode } from "react"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionOption } from "@leetype/lib/leetype/round-probe"
import { ROUND_PROBE_PROMPT } from "@leetype/lib/leetype/round-probe"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { RoundChoices } from "."

const meta: Meta<typeof RoundChoices> = {
  title: "UI/Input/Components/Round/RoundChoices",
  component: RoundChoices,
  parameters: {
    layout: "fullscreen",
    viewport: { defaultViewport: "mobile1" },
  },
}

export default meta
type Story = StoryObj<typeof RoundChoices>

const OPTIONS: ReadonlyArray<PropositionOption> = [
  { id: "CW-P1", text: "Sequential composition adds" },
  { id: "CW-P5", text: "Preprocessing substitutes space for repeated search" },
  { id: "CW-P6", text: "Ordering substitutes a logarithm for a scan" },
  { id: "CW-P9", text: "Triangular iteration is a constant factor" },
]

const ANSWER_ID: PropositionId = "CW-P5"

const Phone = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto w-full max-w-[360px] p-4">{children}</div>
)

/** Before any tap — every option, abstention included, unpainted. */
export const Unresolved: Story = {
  render: () => (
    <Phone>
      <RoundChoices
        prompt={ROUND_PROBE_PROMPT}
        options={OPTIONS}
        answerId={ANSWER_ID}
        onCommit={() => {}}
      />
    </Phone>
  ),
}

/**
 * Tap any row, including "Not sure," to see the verdict land immediately —
 * no separate submit step, and abstaining still marks the answer's own row
 * correct ("a learner who abstained sees exactly what a learner who
 * answered sees," #1220).
 */
export const Interactive: Story = {
  render: () => (
    <Phone>
      <RoundChoices
        prompt={ROUND_PROBE_PROMPT}
        options={OPTIONS}
        answerId={ANSWER_ID}
        onCommit={() => {}}
      />
    </Phone>
  ),
}
