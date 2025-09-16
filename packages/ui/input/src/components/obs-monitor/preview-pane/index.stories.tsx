import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { PreviewPane } from "."

type Story = StoryObj<typeof PreviewPane>
type Meta = MetaObj<typeof PreviewPane>

export const Default: Story = {
  args: {
    currentTime: 100
  },
}

export default {
  title: "UI/Input/Components/OBSMonitor/PreviewPane",
  component: PreviewPane,
} as Meta
