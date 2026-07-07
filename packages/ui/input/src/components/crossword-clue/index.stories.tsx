import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { ClueCard } from "."

type Story = StoryObj<typeof ClueCard>
type Meta = MetaObj<typeof ClueCard>

export const Default: Story = {
  args: {
    isActive: true,
    thumbnail:
      "https://dramanice.cyou/wp-content/uploads/2025/04/Duo-Tian-Que-2025-220x220.jpg",
    className: "size-full max-w-md",
    clue: "This should be a very long clue, how is it rendered? Let use see. Adding some more words to make it longer.",
    clueNum: 12,
  },
}

const meta = {
  title: "UI/Input/Components/ClueCard",
  component: ClueCard,
} satisfies Meta

export default meta
