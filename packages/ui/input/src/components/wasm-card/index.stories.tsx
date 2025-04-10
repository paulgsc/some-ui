import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { CrosswordComponent } from "."

type Story = StoryObj<typeof CrosswordComponent>
type Meta = MetaObj<typeof CrosswordComponent>

export const Default: Story = {}

export default {
  title: "UI/Input/Components/CrosswordComponent",
  component: CrosswordComponent,
} as Meta
