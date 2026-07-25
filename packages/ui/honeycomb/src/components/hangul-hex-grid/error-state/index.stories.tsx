import type { Meta, StoryObj } from "@storybook/react-vite"

import { ErrorState } from "."

const meta: Meta<typeof ErrorState> = {
  title: "UI/Honeycomb/Hangul/Components/ErrorState",
  component: ErrorState,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ErrorState>

export default meta
type Story = StoryObj<typeof meta>

/** A specific error message from the WASM loader. */
export const WithMessage: Story = {
  args: { error: "Failed to fetch hangul_game_core_bg.wasm (404)" },
}

/** No message supplied - falls back to the generic "Failed to initialize game" copy. */
export const Generic: Story = {
  args: { error: null },
}
