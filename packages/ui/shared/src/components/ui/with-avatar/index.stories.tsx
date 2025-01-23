import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { WithAvatar } from "."

type Story = StoryObj<typeof WithAvatar>
type Meta = MetaObj<typeof WithAvatar>

const avatar = {
  src: "https://github.com/shadcn.png",
  alt: "@shadcn",
  fallback: "CN",
}

export const Default: Story = {
  args: {
    avatar,
    avatarSize: 75,
  },
}

export default {
  title: "UI/Shared/WithAvatar",
  component: WithAvatar,
} as Meta
