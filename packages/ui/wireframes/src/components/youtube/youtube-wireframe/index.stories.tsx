import type { Meta as MetaObj, StoryObj } from "@storybook/react"
import YoutubeWireframe from "@wireframes/components/youtube/youtube-wireframe"

type Story = StoryObj<typeof YoutubeWireframe>
type Meta = MetaObj<typeof YoutubeWireframe>

export const Default: Story = {}

export default {
  title: "WireFrames/Youtube",
  component: YoutubeWireframe,
} as Meta
