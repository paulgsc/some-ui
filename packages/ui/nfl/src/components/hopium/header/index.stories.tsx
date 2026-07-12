import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { Header } from "."

type Story = StoryObj<typeof Header>
type Meta = MetaObj<typeof Header>

export const Default: Story = {}

const meta = {
  title: "UI/NFL/Components/Hopium/Header",
  component: Header,
} satisfies Meta

export default meta
