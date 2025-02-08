import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { ChatHeader } from "."

type Story = StoryObj<typeof ChatHeader>
type Meta = MetaObj<typeof ChatHeader>
const characters = [
  {
    src: "https://github.com/shadcn.png",
    alt: "@shadcn",
    fallback: "CN",
  },
  {
    src: "https://github.com/openai.png",
    alt: "@openai",
    fallback: "AI",
  },
]

export const Default: Story = {
  args: {
    characters,
  },
}

export default {
  title: "UI/Chat/Components/ChatHeader",
  component: ChatHeader,
} as Meta
