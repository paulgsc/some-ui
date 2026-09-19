import type { Meta, StoryObj } from "@storybook/react-vite"

import { ExtensionsComb } from "."

/**
 * The whole page is one component with no props: every level is the same
 * seven registers re-roled, so there is nothing to parameterise and no
 * variant to pass in. The levels below are reached the way a visitor reaches
 * them — by clicking a cell — which is also the only way to assert that the
 * transitions work.
 *
 * The decorator gives it a viewport-sized box and nothing else, because that
 * is the contract: the comb positions itself absolutely against its host and
 * scales to fill it. Handing it a box of content height would measure a
 * layout that never ships.
 *
 * Swept by `apps/www/tests/ui-fit/no-overflow.spec.ts` at all four viewports,
 * including 780x390: a landscape phone is the shape this layout is most
 * likely to fail on, because the comb is bounded by its short axis there.
 */
const meta: Meta<typeof ExtensionsComb> = {
  title: "UI/Honeycomb/ExtensionsComb",
  component: ExtensionsComb,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="bg-background relative h-svh w-full overflow-hidden">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ExtensionsComb>

export default meta
type Story = StoryObj<typeof meta>

/**
 * L0. At rest the DOM renders no prose at all — the heading is visually
 * hidden and the comb is the whole page.
 */
export const Index: Story = {}
