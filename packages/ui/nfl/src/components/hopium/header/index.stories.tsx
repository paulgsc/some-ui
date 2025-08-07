import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { Header } from "."

type Story = StoryObj<typeof Header>
type Meta = MetaObj<typeof Header>

export const Default: Story = {}

export default {
  title: "UI/NFL/Components/Hopium/Header",
  component: Header,
} as Meta
