import { InsetCard } from "@slideshow/components/inset-card"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

type Story = StoryObj<typeof InsetCard>
type Meta = MetaObj<typeof InsetCard>

export const Default: Story = {
  args: {
    topVh: 25,
  },
}

export default {
  title: "UI/Slideshow/Components/Inset",
  component: InsetCard,
} as Meta
