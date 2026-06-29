import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { Bookshelf } from "."

type Story = StoryObj<typeof Bookshelf>
type Meta = MetaObj<typeof Bookshelf>

export const Default: Story = {}

export default {
  title: "UI/Makjang/Shapes/Bookshelf",
  component: Bookshelf,
} satisfies Meta
