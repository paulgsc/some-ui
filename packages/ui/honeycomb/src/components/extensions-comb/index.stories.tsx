import type { Meta, StoryObj } from "@storybook/react-vite"

import { ExtensionsComb } from "."

/**
 * One component with no props; the levels are reached by clicking a cell,
 * which also asserts the transitions work. The decorator gives a
 * viewport-sized box, the comb's contract: it positions and fits itself to
 * its host. Swept by `apps/www/tests/ui-fit/no-overflow.spec.ts`, where
 * 780x390 is the likeliest failure (the comb is bounded by its short axis).
 *
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
 * L0. At rest the page paints no prose but the rest cue — the heading is
 * visually hidden, the caption is empty, and the comb is the whole page.
 */
export const Index: Story = {}
