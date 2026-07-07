import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { ScriptEditor } from "."

type Story = StoryObj<typeof ScriptEditor>
type Meta = MetaObj<typeof ScriptEditor>

export const Default: Story = {
  args: {
    currentTime: 100,
  },
}

const meta: Meta = {
  title: "UI/Input/Components/OBSMonitor/ScriptEditor",
  component: ScriptEditor,
}
export default meta
