import type { Meta, StoryObj } from "@storybook/react-vite"

import RectDisplay from "./some-demo"

const meta = {
  title: "Components/RectDemo",
  component: RectDisplay,
} satisfies Meta

export default meta

type Story = StoryObj<typeof RectDisplay>

// type RectFromNodesStory = StoryObj<typeof RectFromNodes>

// type RectFromPoints = StoryObj<typeof RectFromPoints>

export const Size72px: Story = {
  args: {
    className: "size-96 bg-amber-200",
  },
}
