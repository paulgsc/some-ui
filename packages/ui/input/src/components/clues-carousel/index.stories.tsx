import { CrosswordGridSvg } from "@input/components/crossword-svg"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { CluesCarousel } from "."

type Story = StoryObj<typeof CluesCarousel>
type Meta = MetaObj<typeof CluesCarousel>

export const Default: Story = {
  args: {
    className: "",
  },
  render: (args) => (
    <main className="absolute inset-0 flex items-center justify-center">
      <div className="size-1 opacity-0">
        <CrosswordGridSvg />
      </div>
      <section className="size-120">
        <CluesCarousel {...args} />
      </section>
    </main>
  ),
}

export default {
  title: "UI/Input/Components/CluesCarousel",
  component: CluesCarousel,
} as Meta
