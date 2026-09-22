import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

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
    avatarSize: 75,
    avatarSpacing: 30,
  },
}

/**
 * More avatars than `limit`, not expandable: the overflow chip is inert, so it
 * renders as plain text rather than a focusable button that does nothing.
 */
export const Overflow: Story = {
  args: {
    avatars,
    avatarSize: 48,
    avatarSpacing: 16,
    limit: 2,
  },
}

/** The same overflow, expandable — the chip becomes a real toggle. */
export const ExpandableOverflow: Story = {
  args: {
    avatars,
    avatarSize: 48,
    avatarSpacing: 16,
    limit: 2,
    isExpandable: true,
  },
}

const meta = {
  title: "UI/Shared/AvatarGroup",
  component: AvatarGroup,
} satisfies Meta

export default meta
