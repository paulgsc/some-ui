import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { SlideshowSidebar } from "."

type Story = StoryObj<typeof SlideshowSidebar>
type Meta = MetaObj<typeof SlideshowSidebar>

export const Default: Story = {}

export default {
  title: "UI/SlideShow/Components/Sidebar",
  component: SlideshowSidebar,
} as Meta
