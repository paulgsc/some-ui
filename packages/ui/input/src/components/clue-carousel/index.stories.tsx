import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { ClueCarousel } from "."

type Story = StoryObj<typeof ClueCarousel>
type Meta = MetaObj<typeof ClueCarousel>

export const Default: Story = {
  args: {
    className: "p-0.5 w-full max-w-md h-96",
  },
  render: (args) => (
    <main className="flex min-h-screen flex-1 items-center justify-center">
      <ClueCarousel {...args} />
    </main>
  ),
}

export default {
  title: "UI/Input/Components/ClueCarousel",
  component: ClueCarousel,
} as Meta
