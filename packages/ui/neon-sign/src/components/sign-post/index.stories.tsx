import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { SignPost } from "."

type Story = StoryObj<typeof SignPost>
type Meta = MetaObj<typeof SignPost>

export const Default: Story = {}

export default {
  title: "UI/NeonSign/Components/SignPost",
  component: SignPost,
} as Meta
