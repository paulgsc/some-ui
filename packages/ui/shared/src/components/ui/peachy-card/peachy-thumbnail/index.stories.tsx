import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { PeachyThumbnail } from "."

type Story = StoryObj<typeof PeachyThumbnail>
type Meta = MetaObj<typeof PeachyThumbnail>

export const Default: Story = {
  args: {
    className: "size-96",
  },
}

const meta = {
  title: "UI/Shared/Components/PeachyUI/PeachyThumbnail",
  component: PeachyThumbnail,
} satisfies Meta

export default meta
