import type { Meta, StoryObj } from "@storybook/react-vite"

import { ExtensionsComb } from "."

/**
 * The whole page is one component with no props: every level is the same
 * seven registers re-roled, so there is nothing to parameterise and no
 * variant to pass in. The levels below are reached the way a visitor reaches
 * them — by clicking a cell — which is also the only way to assert that the
 * transitions work.
 *
 * Swept by `apps/www/tests/ui-fit/no-overflow.spec.ts` at all four viewports,
 * including 780x390: a landscape phone is the shape this layout is most
 * likely to fail on, because the comb is bounded by height there and by width
 * everywhere else.
 */
const meta: Meta<typeof ExtensionsComb> = {
  title: "UI/Honeycomb/ExtensionsComb",
  component: ExtensionsComb,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="bg-background size-full overflow-hidden p-4 md:p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ExtensionsComb>

export default meta
type Story = StoryObj<typeof meta>

/**
 * L0. At rest the DOM holds the `<h1>` and the comb, and no other sentence —
 * the property the whole design law exists to protect.
 */
export const Index: Story = {}
