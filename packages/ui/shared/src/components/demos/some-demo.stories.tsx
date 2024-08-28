import type { Meta, StoryObj } from "@storybook/react"

import RectDisplay from "./some-demo"

export default {
  title: "Components/RectDemo",
  component: RectDisplay,
} as Meta

type Story = StoryObj<typeof RectDisplay>

// type RectFromNodesStory = StoryObj<typeof RectFromNodes>

// type RectFromPoints = StoryObj<typeof RectFromPoints>

export const Size72px: Story = {
  args: {
    className: "size-96 bg-amber-200",
  },
}
