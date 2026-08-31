import type { Budget } from "@leetype/types/constraint"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { BudgetDisplay } from "."

const meta: Meta<typeof BudgetDisplay> = {
  title: "UI/Input/Components/Round/BudgetDisplay",
  component: BudgetDisplay,
  parameters: {
    layout: "fullscreen",
    viewport: { defaultViewport: "mobile1" },
  },
}

export default meta
type Story = StoryObj<typeof BudgetDisplay>

const Phone = ({ budget }: { budget: Budget }) => (
  <div className="mx-auto w-full max-w-[390px] p-3">
    <BudgetDisplay budget={budget} />
  </div>
)

/** The coarseness statement renders every time — the story's own screenshot is the acceptance check for "not in a tooltip." */
export const WithWallClock: Story = {
  render: () => (
    <Phone budget={{ operations: 10_000_000, wallClock: "~1 second" }} />
  ),
}

/** `wallClock` is optional — the operation count and the coarseness statement stand on their own. */
export const OperationsOnly: Story = {
  render: () => <Phone budget={{ operations: 100_000_000 }} />,
}
