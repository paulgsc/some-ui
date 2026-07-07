import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { ClueThumbnail } from "."

type Story = StoryObj<typeof ClueThumbnail>
type Meta = MetaObj<typeof ClueThumbnail>

export const Default: Story = {}

const meta = {
  title: "UI/Input/Components/ClueThumbnail",
  component: ClueThumbnail,
} satisfies Meta

export default meta
