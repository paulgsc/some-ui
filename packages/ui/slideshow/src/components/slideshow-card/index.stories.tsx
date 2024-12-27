import SlideShowCard from "@slideshow/components/slideshow-card"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

type Story = StoryObj<typeof SlideShowCard>
type Meta = MetaObj<typeof SlideShowCard>

export const Default: Story = {}

export default { title: "SlideShow UI", component: SlideShowCard } as Meta
