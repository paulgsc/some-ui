import YoutubeOverlay from "@overlays/components/youtube"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

type Story = StoryObj<typeof YoutubeOverlay>
type Meta = MetaObj<typeof YoutubeOverlay>

export const Default: Story = {}

export default {
  title: "Overlay/Youtube",
  component: YoutubeOverlay,
} as Meta
