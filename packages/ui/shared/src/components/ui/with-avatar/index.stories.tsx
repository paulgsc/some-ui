import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

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

const meta = {
  title: "UI/Shared/WithAvatar",
  component: WithAvatar,
} satisfies Meta

export default meta
