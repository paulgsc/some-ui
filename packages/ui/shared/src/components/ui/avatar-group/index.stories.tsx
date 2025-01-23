import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import AvatarGroup from "."

type Story = StoryObj<typeof AvatarGroup>
type Meta = MetaObj<typeof AvatarGroup>

const avatars = [
  {
    src: "https://github.com/shadcn.png",
    alt: "@shadcn",
    fallback: "CN",
  },
  {
    src: "https://github.com/vercel.png",
    alt: "@vercel",
    fallback: "VL",
  },
  {
    src: "https://github.com/openai.png",
    alt: "@openai",
    fallback: "AI",
  },
  { src: "", alt: "@fallback", fallback: "FB" }, // Missing src example
]

export const Default: Story = {
  args: {
    avatars,
  },
}

export default {
  title: "UI/Shared/AvatarGroup",
  component: AvatarGroup,
} as Meta
