import type { Meta as MetaObj, StoryObj } from "@storybook/react"
import YoutubeOverlay from "@wireframes/components/youtube-overlay"

type Story = StoryObj<typeof YoutubeOverlay>
type Meta = MetaObj<typeof YoutubeOverlay>

export const Default: Story = {}

export default {
  title: "WireFrames/Youtube",
  component: YoutubeOverlay,
} as Meta
