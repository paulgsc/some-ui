import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { LayoutEditor } from "."

type Story = StoryObj<typeof LayoutEditor>
type Meta = MetaObj<typeof LayoutEditor>

export const Default: Story = {}

export default {
  title: "UI/Wireframes/Layout/Editor",
  component: LayoutEditor,
} satisfies Meta
