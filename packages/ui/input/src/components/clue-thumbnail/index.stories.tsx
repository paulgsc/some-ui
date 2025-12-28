import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { ClueThumbnail } from "."

type Story = StoryObj<typeof ClueThumbnail>
type Meta = MetaObj<typeof ClueThumbnail>

export const Default: Story = {}

export default {
  title: "UI/Input/Components/ClueThumbnail",
  component: ClueThumbnail,
} as Meta
