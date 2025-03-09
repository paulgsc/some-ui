import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { YTGridThumbnail } from "."

type Story = StoryObj<typeof YTGridThumbnail>
type Meta = MetaObj<typeof YTGridThumbnail>

export const Default: Story = {}

export default {
  title: "UI/Overlays/grid-thumbnail",
  component: YTGridThumbnail,
} as Meta
