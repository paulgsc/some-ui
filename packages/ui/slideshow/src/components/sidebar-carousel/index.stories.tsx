import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import SidebarCarousel from "."

type Story = StoryObj<typeof SidebarCarousel>
type Meta = MetaObj<typeof SidebarCarousel>

export const Default: Story = {}

export default {
  title: "SlideShow/Carousel/Sidebar",
  component: SidebarCarousel,
} as Meta
