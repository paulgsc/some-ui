import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import YoutubeMarquee from "."

type Story = StoryObj<typeof YoutubeMarquee>
type Meta = MetaObj<typeof YoutubeMarquee>

export const Default: Story = {}

const meta = {
  title: "Overlays/Youtube/Marquee",
  component: YoutubeMarquee,
} satisfies Meta

export default meta
