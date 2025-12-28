import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { Header } from "."

type Story = StoryObj<typeof Header>
type Meta = MetaObj<typeof Header>

export const Default: Story = {
  args: {
    className: "size-full",
  },
}

export default {
  title: "UI/Input/Components/OBSMonitor/Header",
  component: Header,
} as Meta
