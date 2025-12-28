import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { TVScreen } from "."

type Story = StoryObj<typeof TVScreen>
type Meta = MetaObj<typeof TVScreen>

export const Default: Story = {}

export default {
  title: "UI/Makjang/Shapes/Screens/TVScreen",
  component: TVScreen,
} as Meta
