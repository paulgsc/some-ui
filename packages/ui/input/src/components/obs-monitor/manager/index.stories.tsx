import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { OBSScriptManager } from "."

type Story = StoryObj<typeof OBSScriptManager>
type Meta = MetaObj<typeof OBSScriptManager>

export const Default: Story = {
  args: {
    className: "size-full",
  },
}

export default {
  title: "UI/Input/Components/OBSMonitor/OBSScriptManager",
  component: OBSScriptManager,
} as Meta
