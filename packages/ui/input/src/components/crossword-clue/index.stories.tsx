import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { ClueCard } from "."

type Story = StoryObj<typeof ClueCard>
type Meta = MetaObj<typeof ClueCard>

export const Default: Story = {
  args: {
    isActive: true,
    thumbnail:
      "https://dramanice.cyou/wp-content/uploads/2025/04/Duo-Tian-Que-2025-220x220.jpg",
    className: "size-full max-w-md",
  },
}

export default {
  title: "UI/Input/Components/ClueCard",
  component: ClueCard,
} as Meta
