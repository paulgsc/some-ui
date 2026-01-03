import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { App } from "."

type Story = StoryObj<typeof App>
type Meta = MetaObj<typeof App>

export const Default: Story = {}

export default {
  title: "UI/Video/Components/App",
  component: App,
} as Meta
