import type { ReactNode } from "react"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { RoundFeedback } from "."

const meta: Meta<typeof RoundFeedback> = {
  title: "UI/Input/Components/Round/RoundFeedback",
  component: RoundFeedback,
  parameters: {
    layout: "fullscreen",
    viewport: { defaultViewport: "mobile1" },
  },
}

export default meta
type Story = StoryObj<typeof RoundFeedback>

const Phone = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto w-full max-w-[390px] p-3">{children}</div>
)

// Sourced from the real, generated register rather than hand-typed example
// text — review finding on this PR (chatgpt-codex-connector): a hand-
// cleaned example can look right in Storybook while the real pipeline
// still renders raw typst markup verbatim, concealing exactly the gap that
// finding caught. Using `PROPOSITION_REGISTER` directly means these
// stories fail the moment `justification` stops being real display text.
const SEQ_STATEMENT = PROPOSITION_REGISTER["CW-P1"].statement
const PREPROCESSING_STATEMENT = PROPOSITION_REGISTER["CW-P5"].statement

/** The register's own statement alone — every active proposition has one by construction (`#1330`). */
export const StatementOnly: Story = {
  render: () => (
    <Phone>
      <RoundFeedback justification={SEQ_STATEMENT} />
    </Phone>
  ),
}

/**
 * The general claim, plus the round-specific gloss beneath it — never
 * instead of it (#1220's own acceptance criterion). `gloss` is authored
 * per-round prose (`DiffSetMember.propositionGloss`), not canon markup, so
 * this one stays hand-typed.
 */
export const WithRoundSpecificGloss: Story = {
  render: () => (
    <Phone>
      <RoundFeedback
        justification={PREPROCESSING_STATEMENT}
        gloss="This hunk builds a Set from the allowlist once, outside the loop, instead of calling .includes() on the array inside it — exactly the rewrite CW-P5 names."
      />
    </Phone>
  ),
}
