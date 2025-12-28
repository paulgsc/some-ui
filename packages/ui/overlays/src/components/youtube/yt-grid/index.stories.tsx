import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { YtGrid } from "."

type Story = StoryObj<typeof YtGrid>
type Meta = MetaObj<typeof YtGrid>

export const Default: Story = {}

export default {
  title: "UI/Overlays/Yt-Grid",
  component: YtGrid,
} as Meta
