import type { Meta, StoryObj } from "@storybook/react-vite"

import { LoadingState } from "."

const meta: Meta<typeof LoadingState> = {
  title: "UI/Honeycomb/Hangul/Components/LoadingState",
  component: LoadingState,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LoadingState>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
