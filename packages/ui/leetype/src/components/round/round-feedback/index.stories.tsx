import type { ReactNode } from "react"
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

/** The register's own statement alone — every active proposition has one by construction (`#1330`). */
export const StatementOnly: Story = {
  render: () => (
    <Phone>
      <RoundFeedback justification="Sibling control flow executed in sequence contributes the sum of its members' costs: T(Seq(G_1, ..., G_m)) = sum_i T(G_i)." />
    </Phone>
  ),
}

/**
 * The general claim, plus the round-specific gloss beneath it — never
 * instead of it (#1220's own acceptance criterion).
 */
export const WithRoundSpecificGloss: Story = {
  render: () => (
    <Phone>
      <RoundFeedback
        justification="Replacing a repeated linear search inside a loop with one preprocessing pass plus expected constant-time membership rewrites n·m into n + m expected, at Θ(m) additional space."
        gloss="This hunk builds a Set from the allowlist once, outside the loop, instead of calling .includes() on the array inside it — exactly the rewrite CW-P5 names."
      />
    </Phone>
  ),
}
