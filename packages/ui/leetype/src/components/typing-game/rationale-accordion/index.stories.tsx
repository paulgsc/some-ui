import type { RationaleChoice } from "@leetype/types/exercise"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { RationaleAccordion } from "."

const meta: Meta<typeof RationaleAccordion> = {
  title: "UI/Input/Components/Typing/RationaleAccordion",
  component: RationaleAccordion,
}

export default meta
type Story = StoryObj<typeof RationaleAccordion>

const candidates: ReadonlyArray<RationaleChoice> = [
  { text: "borrowing avoids the copy the earlier attempt paid for" },
  {
    text: "the iterator adaptor never materializes a second Vec",
    canonical: true,
  },
  { text: "moving ownership sidesteps the lifetime entirely" },
]

/** Closed — the collapsed affordance under a completed step. */
export const Collapsed: Story = {
  args: { candidates },
}

/**
 * Two candidates deliberately close in shape, so the story doubles as a
 * visual check that "muted, not red" reads correctly for an eliminated
 * candidate once one opens it and types.
 */
export const ThreeCandidates: Story = {
  args: { candidates },
}
