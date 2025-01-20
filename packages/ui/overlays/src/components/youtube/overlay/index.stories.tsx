import YoutubeOverlay from "."
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

type Story = StoryObj<typeof YoutubeOverlay>
type Meta = MetaObj<typeof YoutubeOverlay>

export const Default: Story = {}

export default {
  title: "Overlays/Youtube/Default",
  component: YoutubeOverlay,
} as Meta
