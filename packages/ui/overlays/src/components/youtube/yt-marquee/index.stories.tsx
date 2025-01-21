import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import YoutubeMarquee from "."

type Story = StoryObj<typeof YoutubeMarquee>
type Meta = MetaObj<typeof YoutubeMarquee>

export const Default: Story = {}

export default {
  title: "Overlays/Youtube/Marquee",
  component: YoutubeMarquee,
} as Meta
