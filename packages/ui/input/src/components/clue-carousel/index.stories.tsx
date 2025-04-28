import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { ClueCarousel } from "."

type Story = StoryObj<typeof ClueCarousel>
type Meta = MetaObj<typeof ClueCarousel>

export const Default: Story = {
  args: {
    className: "",
  },
  render: (args) => (
    <main className="absolute inset-0 flex items-center justify-center">
      <section className="size-120">
        <ClueCarousel {...args} />
      </section>
    </main>
  ),
}

export default {
  title: "UI/Input/Components/ClueCarousel",
  component: ClueCarousel,
} as Meta
