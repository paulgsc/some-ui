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

// From the real generated register, not hand-typed text, so these stories
// show it if `justification` ever regresses to raw typst markup.
const SEQ_STATEMENT = PROPOSITION_REGISTER["CW-P1"].statement
const PREPROCESSING_STATEMENT = PROPOSITION_REGISTER["CW-P5"].statement

/** The register's statement alone. */
export const StatementOnly: Story = {
  render: () => (
    <Phone>
      <RoundFeedback justification={SEQ_STATEMENT} />
    </Phone>
  ),
}

/**
 * The general claim with the round-specific gloss beneath it, never instead.
 * `gloss` is authored prose, so it stays hand-typed.
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
