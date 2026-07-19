import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { YTGridThumbnail } from "."

type Story = StoryObj<typeof YTGridThumbnail>
type Meta = MetaObj<typeof YTGridThumbnail>

export const Default: Story = {}

const meta = {
  title: "UI/Overlays/grid-thumbnail",
  component: YTGridThumbnail,
} satisfies Meta

export default meta
