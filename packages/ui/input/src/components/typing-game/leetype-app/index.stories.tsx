import type { Meta, StoryObj } from "@storybook/react-vite"

import { LeetypeApp } from "."

const meta: Meta<typeof LeetypeApp> = {
  title: "UI/Input/Components/Typing/LeetypeApp",
  component: LeetypeApp,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Full leetyping experience — challenge selector, session config, game, and results with XP progression.",
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof LeetypeApp>

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Full flow starting at the challenge selector. Progress is persisted to localStorage.",
      },
    },
  },
}
