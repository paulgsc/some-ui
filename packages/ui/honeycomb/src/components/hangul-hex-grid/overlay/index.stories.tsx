import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { HangulHexGrid } from "."

type Story = StoryObj<typeof HangulHexGrid>
type Meta = MetaObj<typeof HangulHexGrid>

// panel-fit's PANELS.hangul (apps/www/tests/ui-fit/panel-fit.spec.ts) mounts
// this story: the real HangulHexGrid, wired to the real WASM engine.
export const Endless: Story = {
  args: { mode: "endless" },
}

const meta: Meta = {
  title: "UI/Honeycomb/Hangul/Flow/HangulHexGrid",
  component: HangulHexGrid,
  parameters: {
    layout: "fullscreen",
  },
}
export default meta
