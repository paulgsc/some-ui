import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { ScriptSidebar } from "."

type Story = StoryObj<typeof ScriptSidebar>
type Meta = MetaObj<typeof ScriptSidebar>

export const Default: Story = {
  args: {},
}

export default {
  title: "UI/Input/Components/OBSMonitor/ScriptSidebar",
  component: ScriptSidebar,
} as Meta
